import winston from 'winston';

// Create Winston logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ecommerce-security' },
  transports: [
    // Console logging (works in all environments including Vercel)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// File logging only in local production testing (not on serverless platforms like Vercel)
// On serverless platforms, logs automatically go to the platform's logging service
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_FILE_LOGGING === 'true') {
  try {
    logger.add(
      new winston.transports.File({
        filename: 'logs/security-error.log',
        level: 'error',
      })
    );
    logger.add(
      new winston.transports.File({
        filename: 'logs/security-combined.log',
      })
    );
  } catch (error) {
    console.warn('File logging not available (likely serverless environment):', error);
  }
}

// In production, consider adding cloud logging:
// - Vercel: Console logs automatically captured
// - AWS: CloudWatch Logs
// - Google Cloud: Cloud Logging
// - Error tracking: Sentry, LogRocket, etc.

export type SecurityEventType =
  | 'auth_success'
  | 'auth_failure'
  | 'auth_lockout'
  | 'session_created'
  | 'session_expired'
  | 'rate_limit_exceeded'
  | 'validation_failure'
  | 'permission_denied'
  | 'suspicious_activity'
  | 'order_created'
  | 'order_price_mismatch'
  | 'upload_attempt'
  | 'upload_failure'
  | 'admin_action'
  | 'ip_whitelist_violation'
  | 'sql_injection_attempt'
  | 'xss_attempt'
  | 'csrf_failure';

export interface SecurityEventData {
  type: SecurityEventType;
  userId?: string;
  username?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  details?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

class SecurityLogger {
  private logger: winston.Logger;

  constructor(winstonLogger: winston.Logger) {
    this.logger = winstonLogger;
  }

  /**
   * Log a security event
   */
  logEvent(event: SecurityEventData): void {
    const severity = event.severity || 'medium';
    const logLevel = this.getLogLevel(severity);

    this.logger.log(logLevel, 'Security Event', {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log authentication success
   */
  logAuthSuccess(userId: string, username: string, ip: string, userAgent?: string): void {
    this.logEvent({
      type: 'auth_success',
      userId,
      username,
      ip,
      userAgent,
      severity: 'low',
    });
  }

  /**
   * Log authentication failure
   */
  logAuthFailure(username: string, ip: string, reason?: string, userAgent?: string): void {
    this.logEvent({
      type: 'auth_failure',
      username,
      ip,
      userAgent,
      details: { reason },
      severity: 'medium',
    });
  }

  /**
   * Log account lockout
   */
  logAccountLockout(username: string, ip: string, failedAttempts: number): void {
    this.logEvent({
      type: 'auth_lockout',
      username,
      ip,
      details: { failedAttempts },
      severity: 'high',
    });
  }

  /**
   * Log rate limit exceeded
   */
  logRateLimitExceeded(ip: string, path: string, method: string): void {
    this.logEvent({
      type: 'rate_limit_exceeded',
      ip,
      path,
      method,
      severity: 'medium',
    });
  }

  /**
   * Log validation failure
   */
  logValidationFailure(path: string, ip: string, errors: unknown, method?: string): void {
    this.logEvent({
      type: 'validation_failure',
      path,
      ip,
      method,
      details: { errors },
      severity: 'low',
    });
  }

  /**
   * Log permission denied
   */
  logPermissionDenied(
    userId: string,
    username: string,
    path: string,
    requiredPermission: string,
    ip: string
  ): void {
    this.logEvent({
      type: 'permission_denied',
      userId,
      username,
      path,
      ip,
      details: { requiredPermission },
      severity: 'high',
    });
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    type: string,
    ip: string,
    details: Record<string, unknown>,
    userId?: string
  ): void {
    this.logEvent({
      type: 'suspicious_activity',
      userId,
      ip,
      details: { activityType: type, ...details },
      severity: 'high',
    });
  }

  /**
   * Log order creation with price validation
   */
  logOrderCreated(
    orderId: string,
    userId: string,
    clientTotal: number,
    serverTotal: number,
    ip: string
  ): void {
    const isPriceMismatch = Math.abs(clientTotal - serverTotal) > 0.01;
    
    this.logEvent({
      type: isPriceMismatch ? 'order_price_mismatch' : 'order_created',
      userId,
      ip,
      details: {
        orderId,
        clientTotal,
        serverTotal,
        mismatch: isPriceMismatch,
      },
      severity: isPriceMismatch ? 'critical' : 'low',
    });
  }

  /**
   * Log file upload attempt
   */
  logUploadAttempt(
    userId: string,
    filename: string,
    size: number,
    contentType: string,
    ip: string,
    success: boolean
  ): void {
    this.logEvent({
      type: success ? 'upload_attempt' : 'upload_failure',
      userId,
      ip,
      details: {
        filename,
        size,
        contentType,
        success,
      },
      severity: success ? 'low' : 'medium',
    });
  }

  /**
   * Log admin action
   */
  logAdminAction(
    adminId: string,
    adminUsername: string,
    action: string,
    targetId: string,
    ip: string,
    details?: Record<string, unknown>
  ): void {
    this.logEvent({
      type: 'admin_action',
      userId: adminId,
      username: adminUsername,
      ip,
      details: {
        action,
        targetId,
        ...details,
      },
      severity: 'medium',
    });
  }

  /**
   * Log IP whitelist violation
   */
  logIpWhitelistViolation(ip: string, path: string, userId?: string, username?: string): void {
    this.logEvent({
      type: 'ip_whitelist_violation',
      userId,
      username,
      ip,
      path,
      severity: 'critical',
    });
  }

  /**
   * Log general errors
   */
  logError(message: string, error: unknown, ip?: string, details?: Record<string, unknown>): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    this.logger.error(message, {
      error: errorMessage,
      stack: errorStack,
      ip,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get log level based on severity
   */
  private getLogLevel(severity: SecurityEventData['severity']): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
        return 'debug';
      default:
        return 'info';
    }
  }
}

// Export singleton instance
export const securityLogger = new SecurityLogger(logger);

// Export raw logger for general purpose logging
export { logger };


