import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Alphabet without look-alike characters (no 0/O, 1/I/L). */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEY_LENGTH = 32;

/** Random string from the safe alphabet using a CSPRNG. */
export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** 8-character one-time passcode shown to the member once. */
export function generatePasscode(): string {
  return randomCode(8);
}

/** Public profile code, e.g. "CARE-7K2M-9QXD". */
export function generateProfileCode(): string {
  return `CARE-${randomCode(4)}-${randomCode(4)}`;
}

/** Hashes a passcode with scrypt and a fresh 16-byte salt. */
export async function hashPasscode(passcode: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const key = await scryptAsync(passcode.toUpperCase(), salt, KEY_LENGTH);
  return { hash: key.toString("base64"), salt: salt.toString("base64") };
}

/** Constant-time comparison of a passcode against a stored scrypt hash. */
export async function verifyPasscode(passcode: string, hash: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(passcode.toUpperCase(), Buffer.from(salt, "base64"), KEY_LENGTH);
  return expected.length === key.length && timingSafeEqual(expected, key);
}
