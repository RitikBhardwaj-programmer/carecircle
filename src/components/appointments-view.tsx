"use client";

import { useCallback, useEffect, useState } from "react";
import { zonedToUtc } from "@/lib/domain/time";
import { fill } from "@/lib/i18n";
import { api, ApiError, formatDateTime } from "./api";
import { takeAssistDraft } from "./assistant";
import { EmptyState, Skeleton } from "./feedback";
import { Field, FormError } from "./field";
import { Icon } from "./icon";
import { useSession } from "./session-context";

interface Appt {
  id: string;
  doctor: string;
  purpose: string;
  location: string | null;
  notes: string | null;
  at: string;
  updatedBy: string;
  calendarUrl: string;
}

interface Values {
  doctor: string;
  purpose: string;
  location: string;
  notes: string;
  date: string;
  time: string;
}

const EMPTY: Values = { doctor: "", purpose: "", location: "", notes: "", date: "", time: "10:00" };

/** Converts a local date + time in the profile time zone to a UTC ISO string. */
function toIso(date: string, time: string, timeZone: string): string {
  return zonedToUtc(date, time, timeZone).toISOString();
}

function toValues(a: Appt, timeZone: string): Values {
  const d = new Date(a.at);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return {
    doctor: a.doctor,
    purpose: a.purpose,
    location: a.location ?? "",
    notes: a.notes ?? "",
    date,
    time,
  };
}

/** Calendar-style date block; decorative, because the heading next to it says the full date. */
function DateBlock({ iso, timeZone, lang }: { iso: string; timeZone: string; lang: string }) {
  const d = new Date(iso);
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  return (
    <span className="date-block" aria-hidden="true">
      <span className="small">{new Intl.DateTimeFormat(locale, { timeZone, month: "short" }).format(d)}</span>
      <span className="day">{new Intl.DateTimeFormat(locale, { timeZone, day: "numeric" }).format(d)}</span>
    </span>
  );
}

export function AppointmentsView() {
  const { profile, can, t, lang, announce } = useSession();
  const [data, setData] = useState<{ upcoming: Appt[]; past: Appt[] } | null>(null);
  const [editing, setEditing] = useState<Appt | "new" | null>(null);
  const [v, setV] = useState<Values>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/appointments"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Initial data fetch for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // An appointment proposed by "Ask CareCircle" opens the form pre-filled; nothing is saved until Save.
  useEffect(() => {
    const draft = can.write ? takeAssistDraft("appointment") : null;
    if (!draft) return;
    const str = (k: string) => (typeof draft[k] === "string" ? (draft[k] as string) : "");
    const at = str("at");
    // Reading the draft from session storage must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing("new");
    setV({
      ...EMPTY,
      doctor: str("doctor"),
      purpose: str("purpose"),
      location: str("location"),
      date: at ? at.slice(0, 10) : "",
      time: at ? at.slice(11, 16) : EMPTY.time,
    });
  }, [can.write]);

  function open(target: Appt | "new") {
    setEditing(target);
    setV(target === "new" ? EMPTY : toValues(target, profile.timezone));
    setError(null);
    setFields({});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.date || !v.time) {
      setFields({ at: t("chooseDateTime") });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      doctor: v.doctor,
      purpose: v.purpose,
      location: v.location || null,
      notes: v.notes || null,
      at: toIso(v.date, v.time, profile.timezone),
    };
    try {
      if (editing && editing !== "new") await api(`/api/appointments/${editing.id}`, { method: "PUT", body });
      else await api("/api/appointments", { method: "POST", body });
      announce(fill(t("savedAppt"), { name: v.doctor }));
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: Appt) {
    if (!window.confirm(fill(t("confirmDeleteAppt"), { name: a.doctor }))) return;
    try {
      await api(`/api/appointments/${a.id}`, { method: "DELETE" });
      announce(t("apptDeleted"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value });

  function list(items: Appt[], past: boolean) {
    return (
      <ul className="card-list">
        {items.map((a) => (
          <li key={a.id} className={past ? "card item-card muted-card" : "card item-card"}>
            <DateBlock iso={a.at} timeZone={profile.timezone} lang={lang} />
            <div className="item-main">
              <h3>
                {formatDateTime(a.at, profile.timezone, lang)} — {a.doctor}
              </h3>
              <p>{a.purpose}</p>
              {a.location ? <p className="muted">{a.location}</p> : null}
              {a.notes ? <p className="muted">{a.notes}</p> : null}
            </div>
            <div className="item-actions">
              {!past ? (
                <a
                  className="btn btn-secondary"
                  href={a.calendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("addToCalendar")}
                  <span className="sr-only">{t("opensNewTab")}</span>
                </a>
              ) : null}
              {can.write ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => open(a)}
                    aria-label={fill(t("editApptWith"), { name: a.doctor })}
                  >
                    {t("editBtn")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void remove(a)}
                    aria-label={fill(t("deleteApptWith"), { name: a.doctor })}
                  >
                    {t("deleteBtn")}
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="appt-title">
      <h1 id="appt-title">{t("navAppointments")}</h1>
      <p className="muted">{t("apptIntro")}</p>
      {can.write && editing === null ? (
        <button type="button" className="btn btn-primary" onClick={() => open("new")}>
          <Icon name="plus" />
          {t("addAppt")}
        </button>
      ) : null}
      {editing !== null ? (
        <form
          className="card panel"
          onSubmit={save}
          noValidate
          aria-label={editing === "new" ? t("addAppt") : t("editAppt")}
        >
          <h2>{editing === "new" ? t("addAppt") : t("editAppt")}</h2>
          <Field
            label={t("doctor")}
            value={v.doctor}
            onChange={set("doctor")}
            error={fields.doctor}
            required
            maxLength={80}
          />
          <Field
            label={t("purpose")}
            value={v.purpose}
            onChange={set("purpose")}
            error={fields.purpose}
            required
            maxLength={120}
          />
          <div className="row wrap">
            <Field
              label={t("date")}
              type="date"
              value={v.date}
              onChange={set("date")}
              error={fields.at}
              required
            />
            <Field label={t("time")} type="time" value={v.time} onChange={set("time")} required />
          </div>
          <Field
            label={t("locationOpt")}
            value={v.location}
            onChange={set("location")}
            error={fields.location}
            maxLength={160}
          />
          <Field
            label={t("notesOpt")}
            value={v.notes}
            onChange={set("notes")}
            error={fields.notes}
            maxLength={500}
          />
          <FormError message={error} />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("saving") : t("save")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : null}

      <h2>{t("nextAppointments")}</h2>
      {data === null ? (
        <Skeleton label={t("loading")} />
      ) : data.upcoming.length === 0 ? (
        <EmptyState
          icon="calendar"
          text={t("noAppointmentsYet")}
          action={
            can.write && editing === null
              ? { label: t("addAppointment"), onClick: () => open("new") }
              : undefined
          }
        />
      ) : (
        list(data.upcoming, false)
      )}
      <h2>{t("history")}</h2>
      {data && data.past.length > 0 ? list(data.past, true) : <p>{t("noPastAppts")}</p>}
    </section>
  );
}
