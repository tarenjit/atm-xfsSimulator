import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * PIN hashing helpers.
 *
 * WHY: Even in a simulator, plaintext PINs are a hazard — they leak to logs,
 * get copied into tests that reach prod-adjacent environments, and condition
 * engineers to think compare-as-string is acceptable. This module enforces a
 * one-way hash + constant-time verify.
 *
 * Algorithm: salted SHA-256. Not password-grade (bcrypt/argon2 would be
 * better) but appropriate for a 4-digit simulator PIN where the attack model
 * is "keep developers/log-scrapers from seeing the PIN", not "survive an
 * offline brute-force dump".
 *
 * Format: `sha256$<hex-salt>$<hex-hash>`.
 */

const PREFIX = 'sha256$';

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = sha256(salt, pin);
  return `${PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) return false;
  const parts = stored.slice(PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  const actual = sha256(salt, pin);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function sha256(salt: Buffer, pin: string): Buffer {
  return createHash('sha256').update(salt).update(pin, 'utf8').digest();
}
