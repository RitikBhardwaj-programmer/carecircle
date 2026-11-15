import { randomUUID } from "node:crypto";
import { getConfig } from "../infra/config";
import { createMailer } from "../infra/mailer";
import { MemoryRepo } from "../repo/memory-repo";
import type { Repository } from "../repo/repository";
import type { Deps } from "../services/deps";

let current: Deps | null = null;

async function createRepo(kind: "firestore" | "memory"): Promise<Repository> {
  if (kind === "memory") return new MemoryRepo();
  // Loaded lazily so tests and local memory mode never open a Firestore connection.
  const { FirestoreRepo } = await import("../infra/firestore-repo");
  return new FirestoreRepo();
}

/** Composition root: builds the real dependencies once per server instance. */
export async function getDeps(): Promise<Deps> {
  if (current) return current;
  const config = getConfig();
  current = {
    repo: await createRepo(config.dataStore),
    mailer: createMailer(),
    now: () => new Date(),
    newId: () => randomUUID(),
    secret: config.sessionSecret,
    appUrl: config.appUrl,
  };
  return current;
}

/** Test hook: replace the dependencies used by route handlers. */
export function setDepsForTesting(deps: Deps | null): void {
  current = deps;
}
