import { randomUUID } from "node:crypto";
import { getConfig } from "../infra/config";
import { createMailer } from "../infra/mailer";
import { MemoryRepo } from "../repo/memory-repo";
import type { Repository } from "../repo/repository";
import type { Deps } from "../services/deps";

// Kept on globalThis because Next.js bundles route handlers and pages separately;
// a plain module variable would give each bundle its own (in-memory) repository.
const holder = globalThis as typeof globalThis & { __careCircleDeps?: Deps | null };

async function createRepo(kind: "firestore" | "memory"): Promise<Repository> {
  if (kind === "memory") return new MemoryRepo();
  // Loaded lazily so tests and local memory mode never open a Firestore connection.
  const { FirestoreRepo } = await import("../infra/firestore-repo");
  return new FirestoreRepo();
}

/** Composition root: builds the real dependencies once per server instance. */
export async function getDeps(): Promise<Deps> {
  if (holder.__careCircleDeps) return holder.__careCircleDeps;
  const config = getConfig();
  const deps: Deps = {
    repo: await createRepo(config.dataStore),
    mailer: createMailer(),
    now: () => new Date(),
    newId: () => randomUUID(),
    secret: config.sessionSecret,
    appUrl: config.appUrl,
  };
  holder.__careCircleDeps = deps;
  return deps;
}

/** Test hook: replace the dependencies used by route handlers. */
export function setDepsForTesting(deps: Deps | null): void {
  holder.__careCircleDeps = deps;
}
