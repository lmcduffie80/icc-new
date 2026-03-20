import { randomBytes, pbkdf2, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

/**
 * Hash a password using PBKDF2 with a random salt
 */
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString('hex');
  const hash = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${salt}:${hash.toString('hex')}`;
}

/**
 * Verify a password against a stored hash
 */
export async function verifyAdminPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedHashBuffer = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  
  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(hashBuffer, suppliedHashBuffer);
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

// Lockout configuration
export const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDurationMinutes: 15,
};

