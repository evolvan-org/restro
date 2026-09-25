import { randomInt } from 'node:crypto';

export const BCRYPT_ROUNDS = 10;

// No look-alike characters (0/O, 1/l/I), so the password is easy to read out and type.
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMPORARY_PASSWORD_LENGTH = 12;

/** A random password for a new account, from a cryptographically secure source. */
export function generateTemporaryPassword(): string {
  return Array.from({ length: TEMPORARY_PASSWORD_LENGTH }, () =>
    TEMPORARY_PASSWORD_ALPHABET.charAt(randomInt(TEMPORARY_PASSWORD_ALPHABET.length)),
  ).join('');
}
