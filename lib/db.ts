import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type { PoolClient } from 'pg';

// Validate DATABASE_URL is set
const DATABASE_URL = process.env.DATABASE_URL;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  // Don't throw here - allow the app to start, but queries will fail gracefully
}

// Detect connection type for optimal configuration
const isPooledConnection =
  DATABASE_URL?.includes('-pooler') || DATABASE_URL?.includes('pooler=true');

if (DATABASE_URL && IS_DEVELOPMENT) {
  console.log(`🔌 Database connection type: ${isPooledConnection ? 'Pooled' : 'Direct'}`);
  if (!isPooledConnection) {
    console.log(
      '💡 Tip: Use Neon pooled connection (-pooler) for best `pg` Pool stability'
    );
  }
}

// Lazy pool creation to avoid initialization errors at import time.
// We deliberately do NOT track an "isShuttingDown" flag here: pool teardown
// should never make concurrent requests fail. Bad backend connections are
// handled inside the retry loop in `query()` below by recreating
// `poolInstance` *after* the bad pool has been torn down — never during.
let poolInstance: Pool | null = null;

/**
 * Idle-client errors on `pg.Pool` are emitted asynchronously when a backend
 * connection is dropped while sitting idle in the pool. If left unhandled
 * Node will crash with `uncaughtException`. This helper attaches a no-op
 * listener so those errors are logged and the bad client is silently retired
 * by the pool — exactly what we want.
 */
function attachPoolErrorHandler(pool: Pool): void {
  pool.on('error', (err) => {
    if (IS_DEVELOPMENT) {
      console.warn('⚠️ Idle pg client error (will be discarded):', err.message);
    }
  });
}

function buildPoolConfig(): PoolConfig {
  return {
    connectionString: DATABASE_URL,
    // Neon-optimized connection pool settings.
    // Lower max in dev to keep orphaned connections low across hot reloads.
    max: IS_DEVELOPMENT ? 10 : 20,
    min: IS_DEVELOPMENT ? 0 : 2,
    idleTimeoutMillis: IS_DEVELOPMENT ? 10_000 : 20_000,
    connectionTimeoutMillis: 10_000,
    // Neon's pooler terminates TCP TLS sessions cleanly; this is harmless
    // when not pooled but recommended when going through `-pooler`.
    keepAlive: true,
  };
}

/**
 * Creates or retrieves the database connection pool.
 * Optimized for Neon Postgres via the standard `pg` driver — long-lived TCP
 * connections through the Neon `-pooler` endpoint, no WebSocket churn.
 */
function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Cannot create database pool.');
  }

  if (!poolInstance) {
    try {
      poolInstance = new Pool(buildPoolConfig());
      attachPoolErrorHandler(poolInstance);

      if (IS_DEVELOPMENT) {
        console.log('✅ Database pool created (pg, Neon-optimized)');
      }
    } catch (error) {
      console.error('Failed to create database pool:', error);
      throw error;
    }
  }
  return poolInstance;
}

/**
 * Gracefully closes the database pool.
 * Important for preventing orphaned connections during hot reloads.
 *
 * Safe to call concurrently: while the previous pool is draining we already
 * null `poolInstance` so the next `getPool()` call starts fresh, and any
 * mid-flight client/query on the draining pool keeps working until it's done.
 */
async function closePool(): Promise<void> {
  const pool = poolInstance;
  if (!pool) return;

  // Detach our reference *before* awaiting `end()` so concurrent callers
  // immediately allocate a fresh pool instead of waiting on this teardown.
  poolInstance = null;
  try {
    if (IS_DEVELOPMENT) console.log('🔌 Closing database pool...');
    await pool.end();
    if (IS_DEVELOPMENT) console.log('✅ Database pool closed successfully');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
}

// Handle process termination signals for graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing database pool...');
    await closePool();
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing database pool...');
    await closePool();
  });
}

/**
 * Returns the underlying `pg.Pool`. Use this when you need a sticky client
 * for transactions: `const client = await getPoolInstance().connect()`.
 */
export function getPoolInstance(): Pool {
  return getPool();
}

/**
 * Backwards-compatible `pool` export. Forwards to the lazily-created instance
 * so callers that still import `{ pool }` keep working. Stat properties
 * (`totalCount`, `idleCount`, `waitingCount`) are getters that read live
 * values from the active pool — not stale literal zeros.
 */
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const live = getPool();
    const value = (live as unknown as Record<string | symbol, unknown>)[
      prop as string | symbol
    ];
    return typeof value === 'function' ? value.bind(live) : value;
  },
});

/**
 * HTTP-based Neon SQL helper. Each call is a single HTTP request — no pool,
 * no sticky client, no WebSocket. Ideal for hot read paths inside Vercel
 * Functions or Next.js Server Components where you don't need a transaction.
 *
 * Usage (template tag):
 *   const rows = await sql<MyRow[]>`SELECT * FROM products WHERE id = ${id}`;
 *
 * This is *opt-in*. Existing callers of `query()` / `queryOne()` are
 * unaffected and continue to use the `pg.Pool` above.
 */
export const sql: NeonQueryFunction<false, false> | null = DATABASE_URL
  ? neon(DATABASE_URL)
  : null;

/**
 * Checks if an error is a transient connection error that can be retried.
 * Covers both `pg`'s string-style errors and Node-level socket errors.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  // pg surfaces a `code` on its errors for known SQLSTATEs/socket failures
  const code = (error as NodeJS.ErrnoException).code;

  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' || // admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '57P03' || // cannot_connect_now
    code === '08006' || // connection_failure
    code === '08001' || // sqlclient_unable_to_establish_sqlconnection
    code === '08004' // sqlserver_rejected_establishment_of_sqlconnection
  ) {
    return true;
  }

  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated due to connection timeout') ||
    message.includes('client has encountered a connection error') ||
    message.includes('connection closed') ||
    message.includes('terminating connection') ||
    message.includes('connection timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper function to execute queries with timeout and automatic retry.
 *
 * Implements bounded exponential backoff for transient connection errors.
 * Notably this no longer force-recreates the pool from inside the retry loop:
 * doing so caused every concurrent request to fail with
 * `Database pool is shutting down` while the rebuild was in flight. `pg.Pool`
 * already evicts dead clients on its own.
 */
export async function query<T>(
  sql: string,
  params?: unknown[],
  timeout: number = 30_000
): Promise<T[]> {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set. Cannot execute query.');
    throw new Error(
      'Database connection not configured. Please set DATABASE_URL environment variable.'
    );
  }

  const maxRetries = 3;
  const baseDelay = 100; // 100ms, 200ms, 400ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      // statement_timeout is per-session in Postgres; set it on this client.
      await client.query(`SET statement_timeout = ${timeout}`);
      const result = await client.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isTransientError(error) && !isLastAttempt) {
        const delay = baseDelay * Math.pow(2, attempt);
        if (IS_DEVELOPMENT) {
          console.warn(
            `⚠️ Transient database error (attempt ${attempt + 1}/${
              maxRetries + 1
            }), retrying in ${delay}ms: ${(error as Error).message}`
          );
        }
        await sleep(delay);
        continue;
      }

      if (isLastAttempt && isTransientError(error)) {
        console.error('❌ All retry attempts exhausted for transient error');
      }
      throw error;
    } finally {
      // Always release the client, even on error, so it doesn't leak.
      if (client) {
        try {
          client.release();
        } catch {
          // Ignore: release on a broken client throws; pool will discard it.
        }
      }
    }
  }

  // Unreachable, but TypeScript can't prove it.
  throw new Error('Query failed after all retry attempts');
}

// Helper function to execute a single query and return first row
export async function queryOne<T>(
  sql: string,
  params?: unknown[],
  timeout: number = 30_000
): Promise<T | null> {
  const result = await query<T>(sql, params, timeout);
  return result[0] || null;
}

/**
 * Execute a callback inside a database transaction.
 *
 * Acquires a single sticky `PoolClient`, runs `BEGIN`, invokes the callback
 * with that client (so all of the callback's queries share one session),
 * then `COMMIT`s on success or `ROLLBACK`s on any thrown error. The client
 * is always released back to the pool, even if `ROLLBACK` itself fails.
 *
 * Unlike `query()`, transactions are NOT automatically retried — a partial
 * transaction can't safely be replayed without knowing whether each
 * statement is idempotent. If you need retry semantics, call
 * `withTransaction` inside your own retry loop.
 *
 * Example:
 * ```ts
 * const newRow = await withTransaction(async (client) => {
 *   await client.query('UPDATE foo SET active = false WHERE active = true');
 *   const { rows } = await client.query<Foo>(
 *     'INSERT INTO foo (...) VALUES (...) RETURNING *',
 *     [...]
 *   );
 *   return rows[0];
 * });
 * ```
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  timeout: number = 30_000
): Promise<T> {
  if (!DATABASE_URL) {
    throw new Error(
      'Database connection not configured. Please set DATABASE_URL environment variable.'
    );
  }

  const client = await getPool().connect();
  try {
    await client.query(`SET statement_timeout = ${timeout}`);
    await client.query('BEGIN');
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // ROLLBACK can fail if the connection is already broken — log and
        // surface the original error, which is the more useful diagnostic.
        console.error('ROLLBACK failed after transaction error:', rollbackError);
      }
      throw error;
    }
  } finally {
    try {
      client.release();
    } catch {
      // Ignore: release on a broken client throws; pool will discard it.
    }
  }
}

/**
 * Tests database connection with detailed diagnostics.
 * Returns connection health status and timing information.
 */
export async function testConnection(): Promise<{
  connected: boolean;
  responseTime?: number;
  error?: string;
}> {
  if (!DATABASE_URL) {
    return { connected: false, error: 'DATABASE_URL not configured' };
  }

  const startTime = Date.now();
  try {
    await getPool().query('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;
    if (IS_DEVELOPMENT) {
      console.log(`✅ Database connection healthy (${responseTime}ms)`);
    }
    return { connected: true, responseTime };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `❌ Database connection test failed (${responseTime}ms):`,
      errorMessage
    );
    return { connected: false, responseTime, error: errorMessage };
  }
}

/**
 * Get connection pool statistics for monitoring.
 * Reads live counts off the active `pg.Pool`.
 */
export function getPoolStats() {
  if (!DATABASE_URL) {
    return {
      configured: false,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
  }

  try {
    const live = getPool();
    return {
      configured: true,
      totalCount: live.totalCount,
      idleCount: live.idleCount,
      waitingCount: live.waitingCount,
      isPooled: isPooledConnection,
      environment: process.env.NODE_ENV,
    };
  } catch {
    return {
      configured: true,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      isPooled: isPooledConnection,
      environment: process.env.NODE_ENV,
    };
  }
}

/**
 * Export cleanup function for graceful shutdown.
 * Call this when shutting down the application.
 */
export { closePool };
