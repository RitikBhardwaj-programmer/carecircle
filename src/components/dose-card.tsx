"use client";

import type { MessageKey } from "@/lib/i18n";

export type DoseCardState = "taken" | "skipped" | "missed" | "due" | "upcoming";

export interface DoseCardProps {
  dose: {
    id: string;
    name: string;
    dosage: string;
    instructions: string | null;
    time: string;
    state: DoseCardState;
    loggedBy: string | null;
  };
  canWrite: boolean;
  busy?: boolean;
  large?: boolean;
  t: (key: MessageKey) => string;
  onMark: (doseId: string, status: "taken" | "skipped") => void;
}

/** Icon + text for each state, so meaning never depends on colour alone. */
const STATE_ICON: Record<DoseCardState, string> = {
  taken: "✓",
  skipped: "–",
  missed: "!",
  due: "●",
  upcoming: "○",
};

export function DoseCard({ dose, canWrite, busy = false, large = false, t, onMark }: DoseCardProps) {
  const headingId = `dose-${dose.id}`;
  const done = dose.state === "taken" || dose.state === "skipped";
  return (
    <article className={`dose-card state-${dose.state}${large ? " dose-card-large" : ""}`} aria-labelledby={headingId}>
      <div className="dose-main">
        <p className="dose-time">{dose.time}</p>
        <h3 id={headingId} className="dose-name">
          {dose.name} <span className="dose-dosage">{dose.dosage}</span>
        </h3>
        {dose.instructions ? <p className="dose-instructions">{dose.instructions}</p> : null}
        <p className="dose-state">
          <span aria-hidden="true" className="state-icon">
            {STATE_ICON[dose.state]}
          </span>{" "}
          {t(dose.state)}
          {dose.loggedBy ? ` · ${t("by")} ${dose.loggedBy}` : ""}
        </p>
      </div>
      {canWrite && !done ? (
        <div className="dose-actions">
          <button
            type="button"
            className="btn btn-primary btn-big"
            disabled={busy}
            onClick={() => onMark(dose.id, "taken")}
            aria-describedby={headingId}
          >
            {large ? t("markTaken") : t("taken")}
          </button>
          {!large ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onMark(dose.id, "skipped")}
              aria-describedby={headingId}
            >
              {t("skip")}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
