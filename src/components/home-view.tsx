"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, formatDateTime } from "./api";
import { useElderMode } from "./app-shell";
import { DoseCard, type DoseCardProps } from "./dose-card";
import { ReadAloudButton } from "./read-aloud";
import { useSession } from "./session-context";

type Dose = DoseCardProps["dose"] & { at: string };
interface Stats {
  due: number;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
}
interface DosesResponse {
  date: string;
  doses: Dose[];
  adherence: Array<{ medicationId: string; name: string; dosage: string; week: Stats; month: Stats }>;
}
interface Appt {
  id: string;
  doctor: string;
  purpose: string;
  location: string | null;
  at: string;
  calendarUrl: string;
}

export function HomeView() {
  const { profile, member, can, t, lang, announce } = useSession();
  const [elderMode] = useElderMode(member.role === "elder");
  const [data, setData] = useState<DosesResponse | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  async function mark(doseId: string, status: "taken" | "skipped") {
    setBusy(doseId);
    try {
      await api("/api/doses", { method: "POST", body: { doseId, status } });
      announce(status === "taken" ? t("markedTaken") : t("markedSkipped"));
      await load();
    } catch (e) {
      announce((e as Error).message);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <section aria-labelledby="home-title">
        <h1 id="home-title">{t("todayTitle")}</h1>
        <p role="alert">{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          {t("retry")}
        </button>
      </section>
    );
  }
  if (!data) return <p aria-busy="true">{t("loading")}</p>;

  const pending = data.doses.filter((d) => d.state !== "taken" && d.state !== "skipped");
  const spoken = pending.length
    ? pending.map((d) => `${d.time}: ${d.name}, ${d.dosage}. ${t(d.state)}.`).join(" ")
    : t("noDoses");

  if (elderMode) {
    // Elder Mode: one large card per pending dose, one big button, read-aloud.
    return (
      <section aria-labelledby="home-title" className="elder-home">
        <h1 id="home-title">
          {t("todayTitle")} — {profile.elderName}
        </h1>
        <ReadAloudButton text={spoken} lang={lang} label={t("readAloud")} stopLabel={t("stopReading")} />
        {error ? <p role="alert">{error}</p> : null}
        {data.doses.length === 0 ? <p className="big-text">{t("noDoses")}</p> : null}
        {data.doses.length > 0 && pending.length === 0 ? (
          <p className="big-text done-banner">
            <span aria-hidden="true">✓</span> {t("allDone")}
          </p>
        ) : null}
        <ul className="dose-list" aria-label={t("todayTitle")}>
          {data.doses.map((d) => (
            <li key={d.id}>
              <DoseCard dose={d} canWrite={can.write} busy={busy === d.id} large t={t} onMark={mark} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">
        {t("todayTitle")} — {profile.elderName}
      </h1>
      <ReadAloudButton text={spoken} lang={lang} label={t("readAloud")} stopLabel={t("stopReading")} />
      {error ? <p role="alert">{error}</p> : null}
      {data.doses.length === 0 ? (
        <p>
          {t("noDoses")} {can.write ? <Link href="/medications">{t("navMedications")} →</Link> : null}
        </p>
      ) : (
        <ul className="dose-list">
          {data.doses.map((d) => (
            <li key={d.id}>
              <DoseCard dose={d} canWrite={can.write} busy={busy === d.id} t={t} onMark={mark} />
            </li>
          ))}
        </ul>
      )}

      <h2>{t("adherenceTitle")}</h2>
      {data.adherence.length === 0 ? (
        <p>—</p>
      ) : (
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
      )}

      <h2>{t("nextAppointments")}</h2>
      {appts.length === 0 ? (
        <p>{t("noAppointments")}</p>
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

function formatStats(s: Stats): string {
  if (s.rate === null) return "—";
  return `${s.rate}% (${s.taken}/${s.due} taken${s.missed ? `, ${s.missed} missed` : ""})`;
}
