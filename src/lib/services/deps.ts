import type { Member, Profile } from "../domain/types";
import type { Mailer } from "../infra/mailer";
import type { Repository } from "../repo/repository";

/** Everything a service needs, passed in by the caller (route handler or test). */
export interface Deps {
  repo: Repository;
  mailer: Mailer;
  now: () => Date;
  newId: () => string;
  secret: string;
  appUrl: string;
}

/** The logged-in member and their profile, reloaded on every request. */
export interface Actor {
  profile: Profile;
  member: Member;
}

/** Records who changed what. Activity is append-only. */
export async function recordActivity(deps: Deps, actor: Actor, action: string, target: string): Promise<void> {
  await deps.repo.addActivity(actor.profile.id, {
    id: deps.newId(),
    actorName: actor.member.name,
    action,
    target: target.slice(0, 120),
    at: deps.now().toISOString(),
  });
}
