"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { groupByDayPart, nextDose, type DayPart } from "@/lib/domain/day-part";
import { fill } from "@/lib/i18n";
import { api, formatDateTime } from "./api";
import { useElderMode } from "./app-shell";
import { Assistant } from "./assistant";
import { DoseCard, type DoseCardProps } from "./dose-card";
import { EmptyState, Skeleton } from "./feedback";
import { Icon, type IconName } from "./icon";
import { ReadAloudButton } from "./read-aloud";
import { useSession } from "./session-context";

export type Dose = DoseCardProps["dose"] & { at: string; medicationId?: string };
interface Stats {
  due: number;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
}
export interface DosesResponse {
  date: string;
  doses: Dose[];
  adherence: Array<{ medicationId: string; name: string; dosage: string; week: Stats; month: Stats }>;
}
export interface Appt {
  id: string;
  doctor: string;
  purpose: string;
  location: string | null;
  at: string;
  calendarUrl: string;
}

const PART_ICON: Record<DayPart, IconName> = {
  morning: "sunrise",
  afternoon: "today",
  evening: "sunset",
  night: "moon",
};

export function HomeView() {
  const { profile, member, can, t, lang, announce } = useSession();
  const [elderMode] = useElderMode();
  const [data, setData] = useState<DosesResponse | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** After a mark or an undo the button pressed disappears, so focus moves to its replacement. */
  const focusNext = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [d, a] = await Promise.all([
        api<DosesResponse>("/api/doses"),
        api<{ upcoming: Appt[] }>("/api/appointments"),
      ]);
      setData(d);
      setAppts(a.upcoming.slice(0, 3));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Initial data fetch for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const selector = focusNext.current;
    // Wait until the busy state is cleared, or the new button is still disabled and cannot take focus.
    if (!selector || busy) return;
    focusNext.current = null;
    document.querySelector<HTMLElement>(selector)?.focus();
  }, [data, busy]);

  const undo = useCallback(
    async (doseId: string) => {
      setBusy(doseId);
      try {
        await api("/api/doses", { method: "DELETE", body: { doseId } });
        announce(t("undone"));
        focusNext.current = `[data-mark-for="${doseId}"]`;
        await load();
      } catch (e) {
        announce((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [announce, load, t],
  );

  const mark = useCallback(
    async (doseId: string, status: "taken" | "skipped") => {
      setBusy(doseId);
      try {
        await api("/api/doses", { method: "POST", body: { doseId, status } });
        announce(status === "taken" ? t("markedTaken") : t("markedSkipped"), {
          label: t("undo"),
          onAction: () => void undo(doseId),
        });
        focusNext.current = `[data-undo-for="${doseId}"]`;
        await load();
      } catch (e) {
        announce((e as Error).message);
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [announce, load, t, undo],
  );

  const title = (
    <h1 id="home-title">
      {t("todayTitle")} — {profile.elderName}
    </h1>
  );

  if (error && !data) {
    return (
      <section aria-labelledby="home-title">
        {title}
        <p role="alert" className="form-error">
          {error}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          {t("retry")}
        </button>
      </section>
    );
  }
  if (!data) {
    return (
      <section aria-labelledby="home-title">
        {title}
        <Skeleton label={t("loading")} />
      </section>
    );
  }

  const pending = data.doses.filter((d) => d.state !== "taken" && d.state !== "skipped");
  const takenCount = data.doses.filter((d) => d.state === "taken").length;
  const next = nextDose(data.doses);
  const noEmail =
    member.role === "elder" && !member.email ? (
      <p className="notice">
        <Icon name="info" />
        <span>
          {t("noEmailWarning")} <Link href="/circle">{t("navCircle")} →</Link>
        </span>
      </p>
    ) : null;
  const spoken = pending.length
    ? pending.map((d) => `${d.time}: ${d.name}, ${d.dosage}. ${t(d.state)}.`).join(" ")
    : t("noDoses");

  const card = (d: Dose) => (
    <DoseCard
      dose={d}
      canWrite={can.write}
      busy={busy === d.id}
      large={elderMode}
      timeZone={profile.timezone}
      t={t}
      onMark={(id, s) => void mark(id, s)}
      onUndo={(id) => void undo(id)}
    />
  );

  const empty =
    data.doses.length === 0 ? (
      <EmptyState
        icon="pill"
        text={t("noDoses")}
        action={can.write ? { label: t("addFirstMedicine"), href: "/medications" } : undefined}
      />
    ) : null;
  const nextCard = next ? (
    <section className="card next-dose" aria-labelledby="next-dose-title">
      <h2 id="next-dose-title" className="eyebrow">
        <Icon name="clock" />
        {t("nextDose")}
      </h2>
      {card(next)}
    </section>
  ) : null;

  const today = (
    <>
      {data.doses.length === 0 ? null : (
        <>
          <div className="card progress-card">
            <p className="progress-text" id="progress-label">
              {fill(t("progress"), { done: takenCount, total: data.doses.length })}
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-labelledby="progress-label"
              aria-valuemin={0}
              aria-valuemax={data.doses.length}
              aria-valuenow={takenCount}
            >
              <span style={{ width: `${Math.round((takenCount / data.doses.length) * 100)}%` }} />
            </div>
          </div>
          {pending.length === 0 ? (
            <p className="big-text done-banner">
              <Icon name="check" /> {t("allDone")}
            </p>
          ) : null}
        </>
      )}
    </>
  );

  const groups = (
    <>
      {groupByDayPart(data.doses).map((g) => (
        <section key={g.part} className="daypart" aria-labelledby={`part-${g.part}`}>
          <h2 id={`part-${g.part}`}>
            <Icon name={PART_ICON[g.part]} />
            {t(g.part)}
            <span className="daypart-count">({g.doses.length})</span>
          </h2>
          <ul className="dose-list">
            {g.doses.map((d) =>
              d.id === next?.id ? (
                <li key={d.id}>
                  <p className="dose-pointer">
                    <a href="#next-dose-title">
                      {d.time} · {d.name} — {t("shownAbove")}
                    </a>
                  </p>
                </li>
              ) : (
                <li key={d.id}>{card(d)}</li>
              ),
            )}
          </ul>
        </section>
      ))}
    </>
  );

  if (elderMode) {
    // Elder Mode: one large card per dose, one big button, read-aloud.
    return (
      <section aria-labelledby="home-title" className="elder-home">
        <h1 id="home-title">{t("todayTitle")}</h1>
        {error ? <p role="alert">{error}</p> : null}
        {nextCard}
        {empty}
        {today}
        <ReadAloudButton text={spoken} lang={lang} label={t("readAloud")} stopLabel={t("stopReading")} />
        {noEmail}
        <Assistant onMark={mark} />
        {groups}
      </section>
    );
  }

  return (
    <section aria-labelledby="home-title">
      {title}
      {error ? <p role="alert">{error}</p> : null}
      {nextCard}
      {empty}
      {today}
      <ReadAloudButton text={spoken} lang={lang} label={t("readAloud")} stopLabel={t("stopReading")} />
      {noEmail}
      <CircleSummary data={data} appts={appts} part="cards" />
      {groups}
      <Assistant onMark={mark} />
      <CircleSummary data={data} appts={appts} part="bars" />

      <h2>{t("nextAppointments")}</h2>
      {appts.length === 0 ? (
        <EmptyState
          icon="calendar"
          text={t("noAppointments")}
          action={can.write ? { label: t("addAppointment"), href: "/appointments" } : undefined}
        />
      ) : (
        <ul className="plain-list">
          {appts.map((a) => (
            <li key={a.id}>
              <strong>{formatDateTime(a.at, profile.timezone, lang)}</strong> — {a.doctor}: {a.purpose}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Caregiver view: "was it taken?" at a glance, then per-medicine bars. Words, not only colour. */
function CircleSummary({
  data,
  appts,
  part,
}: {
  data: DosesResponse;
  appts: Appt[];
  part: "cards" | "bars";
}) {
  const { profile, t, lang } = useSession();
  const taken = data.doses.filter((d) => d.state === "taken").length;
  const missed = data.doses.filter((d) => d.state === "missed").length;
  const week = data.adherence.reduce(
    (acc, a) => ({ taken: acc.taken + a.week.taken, due: acc.due + a.week.due }),
    { taken: 0, due: 0 },
  );
  const weekRate = week.due ? Math.round((week.taken / week.due) * 100) : null;
  const nextAppt = appts[0];
  return (
    <>
      {part === "cards" ? (
        <div className="summary-grid">
          <section className="card summary-card" aria-labelledby="sum-today">
            <h2 id="sum-today" className="eyebrow">
              <Icon name="check" />
              {t("summaryToday")}
            </h2>
            <p className="big-number">
              {taken}/{data.doses.length}
            </p>
            <p className="muted">{fill(t("summaryTakenMissed"), { taken, missed })}</p>
          </section>
          <section className="card summary-card" aria-labelledby="sum-appt">
            <h2 id="sum-appt" className="eyebrow">
              <Icon name="calendar" />
              {t("summaryNextAppt")}
            </h2>
            {nextAppt ? (
              <>
                <p className="h3">{formatDateTime(nextAppt.at, profile.timezone, lang)}</p>
                <p className="muted">
                  {nextAppt.doctor}: {nextAppt.purpose}
                </p>
              </>
            ) : (
              <p className="muted">{t("noAppointments")}</p>
            )}
          </section>
          <section className="card summary-card" aria-labelledby="sum-week">
            <h2 id="sum-week" className="eyebrow">
              <Icon name="activity" />
              {t("summaryWeek")}
            </h2>
            <p className="big-number">{weekRate === null ? "—" : `${weekRate}%`}</p>
            <p className="muted">{week.due ? `${week.taken}/${week.due}` : "—"}</p>
          </section>
        </div>
      ) : null}
      {part === "bars" && data.adherence.length > 0 ? (
        <section className="card" aria-labelledby="adherence-title">
          <h2 id="adherence-title">{t("adherenceTitle")}</h2>
          <p className="muted small">{t("perMedicine")}</p>
          <ul className="bar-list">
            {data.adherence.map((a) => (
              <li key={a.medicationId} className="bar-row">
                <span className="bar-head">
                  <strong>
                    {a.name} <span className="muted">{a.dosage}</span>
                  </strong>
                  <span>{formatStats(a.week)}</span>
                </span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${a.week.rate ?? 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <details>
            <summary>{t("showTable")}</summary>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t("adherenceTitle")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("navMedications")}</th>
                    <th scope="col">{t("last7")}</th>
                    <th scope="col">{t("last30")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.adherence.map((a) => (
                    <tr key={a.medicationId}>
                      <th scope="row">
                        {a.name} <span className="muted">{a.dosage}</span>
                      </th>
                      <td>{formatStats(a.week)}</td>
                      <td>{formatStats(a.month)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}
    </>
  );
}

function formatStats(s: Stats): string {
  if (s.rate === null) return "—";
  return `${s.rate}% (${s.taken}/${s.due} taken${s.missed ? `, ${s.missed} missed` : ""})`;
}
