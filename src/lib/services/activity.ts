import { authorize } from "./auth";
import type { Actor, Deps } from "./deps";

/** Newest first. The activity log is append-only: there is no edit or delete. */
export async function listActivity(deps: Deps, actor: Actor, limit = 100) {
  authorize(actor, "read");
  return deps.repo.listActivity(actor.profile.id, Math.min(Math.max(limit, 1), 200));
}
