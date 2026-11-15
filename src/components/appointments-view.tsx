"use client";

import { useCallback, useEffect, useState } from "react";
import { zonedToUtc } from "@/lib/domain/time";
import { api, ApiError, formatDateTime } from "./api";
import { Field, FormError } from "./field";
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
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { doctor: a.doctor, purpose: a.purpose, location: a.location ?? "", notes: a.notes ?? "", date, time };
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

  function open(target: Appt | "new") {
    setEditing(target);
    setV(target === "new" ? EMPTY : toValues(target, profile.timezone));
    setError(null);
    setFields({});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.date || !v.time) {
      setFields({ at: "Choose a date and time." });
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
      announce(`Saved appointment with ${v.doctor}`);
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
    if (!window.confirm(`Delete the appointment with ${a.doctor}?`)) return;
    try {
      await api(`/api/appointments/${a.id}`, { method: "DELETE" });
      announce("Appointment deleted");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  function list(items: Appt[], past: boolean) {
    return (
      <ul className="card-list">
        {items.map((a) => (
          <li key={a.id} className={past ? "card muted-card" : "card"}>
            <h3>
              {formatDateTime(a.at, profile.timezone, lang)} — {a.doctor}
            </h3>
            <p>{a.purpose}</p>
            {a.location ? <p className="muted">{a.location}</p> : null}
            {a.notes ? <p className="muted">{a.notes}</p> : null}
            <div className="row wrap">
              {!past ? (
                <a className="btn btn-secondary" href={a.calendarUrl} target="_blank" rel="noopener noreferrer">
                  Add to Google Calendar<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
              {can.write ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => open(a)} aria-label={`Edit appointment with ${a.doctor}`}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void remove(a)} aria-label={`Delete appointment with ${a.doctor}`}>
                    Delete
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
      <p className="muted">Reminder emails go out 24 hours and 2 hours before each appointment.</p>
      {can.write && editing === null ? (
        <button type="button" className="btn btn-primary" onClick={() => open("new")}>
          Add appointment
        </button>
      ) : null}
      {editing !== null ? (
        <form className="card" onSubmit={save} noValidate aria-label={editing === "new" ? "Add appointment" : "Edit appointment"}>
          <h2>{editing === "new" ? "Add appointment" : "Edit appointment"}</h2>
          <Field label="Doctor" value={v.doctor} onChange={set("doctor")} error={fields.doctor} required maxLength={80} />
          <Field label="Purpose" value={v.purpose} onChange={set("purpose")} error={fields.purpose} required maxLength={120} />
          <div className="row wrap">
            <Field label="Date" type="date" value={v.date} onChange={set("date")} error={fields.at} required />
            <Field label="Time" type="time" value={v.time} onChange={set("time")} required />
          </div>
          <Field label="Location (optional)" value={v.location} onChange={set("location")} error={fields.location} maxLength={160} />
          <Field label="Notes (optional)" value={v.notes} onChange={set("notes")} error={fields.notes} maxLength={500} />
          <FormError message={error} />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : null}

      <h2>{t("nextAppointments")}</h2>
      {data === null ? <p aria-busy="true">{t("loading")}</p> : data.upcoming.length === 0 ? <p>{t("noAppointments")}</p> : list(data.upcoming, false)}
      <h2>History</h2>
      {data && data.past.length > 0 ? list(data.past, true) : <p>No past appointments.</p>}
    </section>
  );
}
