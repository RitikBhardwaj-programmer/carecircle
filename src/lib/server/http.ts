import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "../errors";
import { logger } from "../infra/logger";
import type { RateLimiter } from "../infra/rate-limit";
import type { Action } from "../domain/permissions";
import { authorize, resolveSession } from "../services/auth";
import type { Actor, Deps } from "../services/deps";
import { SESSION_TTL_MS } from "../security/tokens";
import { getDeps } from "./container";

export const SESSION_COOKIE = "cc_session";
const MAX_JSON_BYTES = 64 * 1024;

/** JSON error body: { error: { code, message, fields? } }. Internal errors never leak details. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details ? { fields: err.details } : {}) } },
      { status: err.status },
    );
  }
  logger.error("request.failed", { error: err instanceof Error ? err.name : "unknown" });
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/**
 * CSRF defence in addition to SameSite=Strict: a state-changing request must come from our own origin.
 */
export function assertSameOrigin(req: NextRequest): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "Cross-site request blocked.");
  }
  if (originHost !== host) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

/** Reads and validates a JSON body with a size limit. */
export async function readJson<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new AppError("BAD_REQUEST", "Request body is too large.");
  const raw = await req.text();
  if (raw.length > MAX_JSON_BYTES) throw new AppError("BAD_REQUEST", "Request body is too large.");
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new AppError("BAD_REQUEST", "Body must be valid JSON.");
  }
  return parseWith(schema, data);
}

export function parseWith<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map((i) => [i.path.join(".") || "_", i.message]));
    throw new AppError("BAD_REQUEST", "Please check the highlighted fields.", fields);
  }
  return result.data;
}

/**
 * Client address for rate limiting. Google's front end appends the address it saw to
 * X-Forwarded-For, so the last entry is the one a client cannot forge (earlier entries can be).
 */
export function clientIp(req: NextRequest): string {
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean) ?? [];
  return hops.at(-1) ?? "local";
}

export function rateLimit(limiter: RateLimiter, req: NextRequest): void {
  if (!limiter.take(clientIp(req))) {
    // Hop count only (no addresses), to confirm the proxy chain in production logs.
    const hops = req.headers.get("x-forwarded-for")?.split(",").length ?? 0;
    logger.warn("request.rate_limited", { path: req.nextUrl.pathname, xffHops: hops });
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a minute.");
  }
}

export async function requireActor(req: NextRequest, deps: Deps): Promise<Actor> {
  return resolveSession(deps, req.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

type Handler = (ctx: { req: NextRequest; deps: Deps }) => Promise<NextResponse | Response>;

/** Wraps a public route: same-origin check for writes and uniform error mapping. */
export function publicRoute(handler: Handler) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await handler({ req, deps: await getDeps() });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

type AuthedHandler<P> = (ctx: { req: NextRequest; deps: Deps; actor: Actor; params: P }) => Promise<NextResponse | Response>;

/**
 * Wraps a logged-in route: same-origin check, session reload (revokes apply at once), error mapping.
 * `action` is checked before the body is parsed, so a member without permission learns nothing from validation.
 * Services check permissions again (defence in depth).
 */
export function authedRoute<P = Record<string, never>>(handler: AuthedHandler<P>, action: Action = "read") {
  return async (req: NextRequest, context?: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const deps = await getDeps();
      const actor = await requireActor(req, deps);
      authorize(actor, action);
      const params = context ? await context.params : ({} as P);
      return await handler({ req, deps, actor, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
