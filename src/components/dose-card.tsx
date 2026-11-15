"use client";

import type { MessageKey } from "@/lib/i18n";
import { Icon, type IconName } from "./icon";

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
    loggedAt?: string | null;
  };
  canWrite: boolean;
  busy?: boolean;
  large?: boolean;
  /** Profile time zone, used to show when the dose was marked. */
  timeZone?: string;
  t: (key: MessageKey) => string;
  onMark: (doseId: string, status: "taken" | "skipped") => void;
  /** When given, a logged dose shows a small "Change" button that reopens it (Undo). */
  onUndo?: (doseId: string) => void;
}

/** Icon + text for each state, so meaning never depends on colour alone. */
const STATE_ICON: Record<DoseCardState, IconName> = {
  taken: "check",
  skipped: "skip",
  missed: "alert",
  due: "clock",
  upcoming: "clock",
};

function clockTime(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

export function DoseCard({ dose, canWrite, busy = false, large = false, timeZone, t, onMark, onUndo }: DoseCardProps) {
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
            <Icon name={STATE_ICON[dose.state]} />
          </span>
          <span>
            {t(dose.state)}
            {dose.loggedBy ? ` · ${t("by")} ${dose.loggedBy}` : ""}
            {done && dose.loggedAt ? ` · ${clockTime(dose.loggedAt, timeZone)}` : ""}
          </span>
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
            <Icon name="check" />
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
      {canWrite && done && onUndo ? (
        <div className="dose-actions">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy}
            onClick={() => onUndo(dose.id)}
            aria-describedby={headingId}
          >
            <Icon name="undo" />
            {t("change")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
