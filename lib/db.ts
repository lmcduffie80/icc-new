import { Pool } from '@neondatabase/serverless';

// Validate DATABASE_URL is set
const DATABASE_URL = process.env.DATABASE_URL;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  // Don't throw here - allow the app to start, but queries will fail gracefully
}

// Detect connection type for optimal configuration
const isPooledConnection = DATABASE_URL?.includes('-pooler') || DATABASE_URL?.includes('pooler=true');
if (DATABASE_URL && IS_DEVELOPMENT) {
  console.log(`🔌 Database connection type: ${isPooledConnection ? 'Pooled' : 'Direct'}`);
  if (!isPooledConnection) {
    console.log('💡 Tip: Use Neon pooled connection (-pooler) for better Next.js compatibility');
  }
}

// Lazy pool creation to avoid initialization errors
let poolInstance: Pool | null = null;
let isShuttingDown = false;

/**
 * Creates or retrieves the database connection pool
 * Optimized for Neon serverless with hot reload support
 */
function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Cannot create database pool.');
  }
  
  if (isShuttingDown) {
    throw new Error('Database pool is shutting down. Please retry.');
  }
  
  if (!poolInstance) {
    try {
      poolInstance = new Pool({
        connectionString: DATABASE_URL,
        // Neon-optimized connection pool settings
        // Serverless databases prefer fewer persistent connections
        max: IS_DEVELOPMENT ? 10 : 20, // Lower max in dev to reduce orphaned connections
        min: IS_DEVELOPMENT ? 0 : 2, // No idle connections in dev (Neon closes them anyway)
        idleTimeoutMillis: IS_DEVELOPMENT ? 10000 : 20000, // Shorter timeout in dev (10s vs 20s)
        connectionTimeoutMillis: 10000, // 10 second timeout when acquiring connection
        // Query timeout
        statement_timeout: 30000, // 30 second query timeout
      });
      
      if (IS_DEVELOPMENT) {
        console.log('✅ Database pool created with Neon-optimized settings');
      }
    } catch (error) {
      console.error('Failed to create database pool:', error);
      throw error;
    }
  }
  return poolInstance;
}

/**
 * Gracefully closes the database pool
 * Important for preventing orphaned connections during hot reloads
 */
async function closePool(): Promise<void> {
  if (poolInstance && !isShuttingDown) {
    isShuttingDown = true;
    try {
      console.log('🔌 Closing database pool...');
      await poolInstance.end();
      poolInstance = null;
      console.log('✅ Database pool closed successfully');
    } catch (error) {
      console.error('Error closing database pool:', error);
    } finally {
      isShuttingDown = false;
    }
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


// Export pool - will be created lazily when first accessed
// For backward compatibility, we export a getter function
export function getPoolInstance(): Pool {
  return getPool();
}

// Export pool as a property for backward compatibility
// This will throw an error if DATABASE_URL is not set, which is expected
export const pool = {
  connect: () => getPool().connect(),
  query: (...args: Parameters<Pool['query']>) => getPool().query(...args),
  end: () => getPool().end(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
} as Pool;

/**
 * Checks if an error is a transient connection error that can be retried
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection terminated unexpectedly') ||
      message.includes('connection closed') ||
      message.includes('connection timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    );
  }
  return false;
}

/**
 * Sleeps for specified milliseconds (for retry backoff)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to execute queries with timeout and automatic retry
 * Implements exponential backoff for transient connection errors
 */
export async function query<T>(
  sql: string,
  params?: unknown[],
  timeout: number = 30000
): Promise<T[]> {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set. Cannot execute query.');
    throw new Error('Database connection not configured. Please set DATABASE_URL environment variable.');
  }
  
  const maxRetries = 3;
  const baseDelay = 100; // Start with 100ms delay
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const pool = getPool();
      const client = await pool.connect();
      
      try {
        // Set statement timeout for this query
        await client.query(`SET statement_timeout = ${timeout}`);
        const result = await client.query(sql, params);
        return result.rows as T[];
      } finally {
        client.release();
      }
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isTransientError(error) && !isLastAttempt) {
        // Calculate exponential backoff delay: 100ms, 200ms, 400ms
        const delay = baseDelay * Math.pow(2, attempt);
        
        if (IS_DEVELOPMENT) {
          console.warn(`⚠️ Transient database error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        }
        
        await sleep(delay);
        
        // Force pool recreation if we've retried multiple times
        if (attempt >= 2 && poolInstance) {
          console.warn('🔄 Forcing pool recreation after multiple failures...');
          await closePool();
        }
        
        continue; // Retry
      }
      
      // Non-transient error or last attempt - throw it
      if (isLastAttempt && isTransientError(error)) {
        console.error('❌ All retry attempts exhausted for transient error');
      }
      throw error;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Query failed after all retry attempts');
}

// Helper function to execute a single query and return first row
export async function queryOne<T>(
  sql: string,
  params?: unknown[],
  timeout: number = 30000
): Promise<T | null> {
  const result = await query<T>(sql, params, timeout);
  return result[0] || null;
}

/**
 * Tests database connection with detailed diagnostics
 * Returns connection health status and timing information
 */
export async function testConnection(): Promise<{
  connected: boolean;
  responseTime?: number;
  error?: string;
}> {
  if (!DATABASE_URL) {
    return {
      connected: false,
      error: 'DATABASE_URL not configured',
    };
  }
  
  const startTime = Date.now();
  
  try {
    const pool = getPool();
    await pool.query('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;
    
    if (IS_DEVELOPMENT) {
      console.log(`✅ Database connection healthy (${responseTime}ms)`);
    }
    
    return {
      connected: true,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ Database connection test failed (${responseTime}ms):`, errorMessage);
    
    return {
      connected: false,
      responseTime,
      error: errorMessage,
    };
  }
}

/**
 * Get connection pool statistics for monitoring
 * Useful for debugging connection issues
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
    const pool = getPool();
    return {
      configured: true,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
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
 * Export cleanup function for graceful shutdown
 * Call this when shutting down the application
 */
export { closePool };
