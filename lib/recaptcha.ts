import { securityLogger } from './security-logger';

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const SCORE_THRESHOLD = 0.7;

interface RecaptchaResponse {
  success: boolean;
  score: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export interface RecaptchaResult {
  success: boolean;
  score: number;
  action?: string;
  errorCodes?: string[];
}

/**
 * Verify a reCAPTCHA v3 token with Google's API.
 * Returns { success: true, score: 1.0 } when RECAPTCHA_SECRET_KEY is not
 * configured, so the app works in dev without credentials.
 */
export async function verifyRecaptcha(
  token: string,
  ip?: string
): Promise<RecaptchaResult> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    return { success: true, score: 1.0 };
  }

  if (!token) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/contact',
      method: 'POST',
      details: { reason: 'missing_recaptcha_token' },
      severity: 'medium',
    });
    return { success: false, score: 0 };
  }

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/contact',
        method: 'POST',
        details: { reason: 'recaptcha_api_error', status: response.status },
        severity: 'medium',
      });
      return { success: true, score: 1.0 };
    }

    const data: RecaptchaResponse = await response.json();

    if (!data.success || data.score < SCORE_THRESHOLD) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/contact',
        method: 'POST',
        details: {
          reason: 'recaptcha_low_score',
          score: data.score,
          errorCodes: data['error-codes'],
        },
        severity: 'high',
      });
    }

    return {
      success: data.success,
      score: data.score ?? 0,
      action: data.action,
      errorCodes: data['error-codes'],
    };
  } catch (error) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/contact',
      method: 'POST',
      details: {
        reason: 'recaptcha_verification_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      severity: 'medium',
    });
    return { success: true, score: 1.0 };
  }
}

export { SCORE_THRESHOLD };
