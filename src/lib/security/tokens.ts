import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Signed tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Each token kind uses its own derived key, so a session token can never be used as a dose link.
 */

type Purpose = "session" | "dose";

function keyFor(secret: string, purpose: Purpose): Buffer {
  return createHmac("sha256", secret).update(`carecircle:${purpose}`).digest();
}

function sign(data: string, secret: string, purpose: Purpose): string {
  return createHmac("sha256", keyFor(secret, purpose)).update(data).digest("base64url");
}

function encode(payload: object, secret: string, purpose: Purpose): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret, purpose)}`;
}

function decode<T>(token: string, secret: string, purpose: Purpose, schema: z.ZodType<T>): T | null {
  if (token.length > 1024) return null;
  const [data, mac, extra] = token.split(".");
  if (!data || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret, purpose));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const DOSE_LINK_TTL_MS = 24 * 60 * 60 * 1000;

const sessionPayload = z.object({ p: z.string(), m: z.string(), v: z.number().int().default(0), exp: z.number() });
const dosePayload = z.object({ p: z.string(), d: z.string(), m: z.string(), exp: z.number() });

export interface SessionClaims {
  profileId: string;
  memberId: string;
  /** Member's session version; bumping it on the member logs out every older session. */
  version: number;
  exp: number;
}

export function createSessionToken(
  profileId: string,
  memberId: string,
  now: Date,
  secret: string,
  version = 0,
): string {
  return encode({ p: profileId, m: memberId, v: version, exp: now.getTime() + SESSION_TTL_MS }, secret, "session");
}

export function verifySessionToken(token: string, now: Date, secret: string): SessionClaims | null {
  const p = decode(token, secret, "session", sessionPayload);
  if (!p || p.exp <= now.getTime()) return null;
  return { profileId: p.p, memberId: p.m, version: p.v, exp: p.exp };
}

export interface DoseLinkClaims {
  profileId: string;
  doseId: string;
  /** Member the email was sent to; the log records them as the actor. */
  memberId: string;
}

export function createDoseLinkToken(claims: DoseLinkClaims, now: Date, secret: string): string {
  return encode(
    { p: claims.profileId, d: claims.doseId, m: claims.memberId, exp: now.getTime() + DOSE_LINK_TTL_MS },
    secret,
    "dose",
  );
}

export function verifyDoseLinkToken(token: string, now: Date, secret: string): DoseLinkClaims | null {
  const p = decode(token, secret, "dose", dosePayload);
  if (!p || p.exp <= now.getTime()) return null;
  return { profileId: p.p, doseId: p.d, memberId: p.m };
}
