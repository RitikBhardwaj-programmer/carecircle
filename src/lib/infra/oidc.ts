import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export interface IdTokenClaims {
  email?: string;
  email_verified?: boolean;
}

/** Verifies a Google-signed ID token for the given audience and returns its claims. */
export type IdTokenVerifier = (idToken: string, audience: string) => Promise<IdTokenClaims | null>;

const client = new OAuth2Client();

export const googleIdTokenVerifier: IdTokenVerifier = async (idToken, audience) => {
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    return ticket.getPayload() ?? null;
  } catch {
    return null;
  }
};

let activeVerifier: IdTokenVerifier = googleIdTokenVerifier;
export const getIdTokenVerifier = (): IdTokenVerifier => activeVerifier;
/** Test hook to replace Google token verification. */
export function setIdTokenVerifierForTesting(v: IdTokenVerifier | null): void {
  activeVerifier = v ?? googleIdTokenVerifier;
}

export interface CronAuthOptions {
  audience: string;
  invokerEmail: string | undefined;
  devKey: string | undefined;
  verify: IdTokenVerifier;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cloud Scheduler calls the cron route with an OIDC token signed by Google.
 * Accept it only if the signature, audience and service-account email all match.
 * A dev key is accepted only off Cloud Run (see config).
 */
export async function isAuthorizedCron(headers: Headers, opts: CronAuthOptions): Promise<boolean> {
  const devKey = headers.get("x-cron-key");
  if (opts.devKey && devKey) return safeEqual(devKey, opts.devKey);
  const auth = headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  if (!match?.[1] || !opts.invokerEmail) return false;
  const claims = await opts.verify(match[1], opts.audience);
  return Boolean(claims && claims.email_verified && claims.email === opts.invokerEmail);
}
