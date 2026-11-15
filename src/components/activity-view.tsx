"use client";

import { useEffect, useState } from "react";
import { api, formatDateTime } from "./api";
import { useSession } from "./session-context";

interface Entry {
  id: string;
  actorName: string;
  action: string;
  target: string;
  at: string;
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
      <p className="muted">Every change in the circle is recorded here, so everyone can see who did what.</p>
      {error ? <p role="alert">{error}</p> : null}
      {items === null && !error ? <p aria-busy="true">{t("loading")}</p> : null}
      {items && items.length === 0 ? <p>No activity yet.</p> : null}
      {items && items.length > 0 ? (
        <ol className="timeline">
          {items.map((a) => (
            <li key={a.id}>
              <time dateTime={a.at}>{formatDateTime(a.at, profile.timezone, lang)}</time>
              <p>
                <strong>{a.actorName}</strong> {a.action}: {a.target}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
