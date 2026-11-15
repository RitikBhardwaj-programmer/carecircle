"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { api, formatDateTime } from "./api";
import { Skeleton } from "./feedback";
import { useSession } from "./session-context";

interface Entry {
  id: string;
  actorName: string;
  action: string;
  target: string;
  at: string;
}

/** Activity actions are stored in English; known ones are shown in the current language. */
const ACTIONS: Record<string, MessageKey> = {
  "added medication": "actAddedMedication",
  "edited medication": "actEditedMedication",
  "removed medication": "actRemovedMedication",
  "added appointment": "actAddedAppointment",
  "edited appointment": "actEditedAppointment",
  "removed appointment": "actRemovedAppointment",
  "created the profile": "actCreatedProfile",
  "marked dose taken": "actMarkedTaken",
  "marked dose skipped": "actMarkedSkipped",
  "marked dose taken (email link)": "actMarkedTakenEmail",
  "undid dose taken": "actUndidTaken",
  "undid dose skipped": "actUndidSkipped",
  "updated member": "actUpdatedMember",
  "revoked access of": "actRevoked",
  "issued a new passcode for": "actNewPasscode",
};

export function actionText(action: string, t: (k: MessageKey) => string): string {
  const key =
    ACTIONS[action] ?? (/^added (family|caretaker) with /.test(action) ? "actAddedMember" : undefined);
  return key ? t(key) : action;
}

/** Who changed what, newest first. The log is append-only. */
export function ActivityView() {
  const { profile, t, lang } = useSession();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ activity: Entry[] }>("/api/activity")
      .then((r) => setItems(r.activity))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section aria-labelledby="activity-title">
      <h1 id="activity-title">{t("navActivity")}</h1>
      <p className="muted">{t("activityIntro")}</p>
      {error ? <p role="alert">{error}</p> : null}
      {items === null && !error ? <Skeleton label={t("loading")} /> : null}
      {items && items.length === 0 ? <p>{t("noActivity")}</p> : null}
      {items && items.length > 0 ? (
        <ol className="timeline">
          {items.map((a) => (
            <li key={a.id}>
              <time dateTime={a.at}>{formatDateTime(a.at, profile.timezone, lang)}</time>
              <p>
                <strong>{a.actorName}</strong> {actionText(a.action, t)}: {a.target}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
