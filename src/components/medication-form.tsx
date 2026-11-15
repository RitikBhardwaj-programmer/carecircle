"use client";

import { useState } from "react";
import { Field, FormError } from "./field";

export interface MedicationValues {
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
  days: number[];
  startDate: string;
  endDate: string;
  active: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function emptyMedication(today: string): MedicationValues {
  return { name: "", dosage: "", instructions: "", times: ["08:00"], days: [], startDate: today, endDate: "", active: true };
}

interface Props {
  initial: MedicationValues;
  submitLabel: string;
  title: string;
  error?: string | null;
  fields?: Record<string, string>;
  busy?: boolean;
  onSubmit: (values: MedicationValues) => void;
  onCancel?: () => void;
}

/** Add / edit form for a medication schedule. Every input has a label; errors are linked to inputs. */
export function MedicationForm({ initial, submitLabel, title, error = null, fields = {}, busy = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<MedicationValues>(initial);
  const set = <K extends keyof MedicationValues>(k: K, value: MedicationValues[K]) => setV((old) => ({ ...old, [k]: value }));

  function setTime(i: number, value: string) {
    set("times", v.times.map((t, j) => (j === i ? value : t)));
  }
  function toggleDay(d: number) {
    set("days", v.days.includes(d) ? v.days.filter((x) => x !== d) : [...v.days, d].sort());
  }

  return (
    <form
      className="card"
      aria-label={title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2>{title}</h2>
      <Field label="Medicine name" value={v.name} onChange={(e) => set("name", e.target.value)} error={fields.name} required maxLength={80} />
      <Field label="Dosage" hint="For example: 500 mg, 1 tablet" value={v.dosage} onChange={(e) => set("dosage", e.target.value)} error={fields.dosage} required maxLength={60} />
      <Field label="Instructions (optional)" hint="For example: after food" value={v.instructions} onChange={(e) => set("instructions", e.target.value)} error={fields.instructions} maxLength={300} />

      <fieldset className="field">
        <legend>Times of day</legend>
        {v.times.map((time, i) => (
          <div key={i} className="row">
            <label htmlFor={`time-${i}`} className="sr-only">
              Time {i + 1}
            </label>
            <input id={`time-${i}`} type="time" value={time} onChange={(e) => setTime(i, e.target.value)} required />
            {v.times.length > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={() => set("times", v.times.filter((_, j) => j !== i))}>
                Remove time {i + 1}
              </button>
            ) : null}
          </div>
        ))}
        {v.times.length < 8 ? (
          <button type="button" className="btn btn-secondary" onClick={() => set("times", [...v.times, "20:00"])}>
            Add a time
          </button>
        ) : null}
        {fields.times ? <p className="error">{fields.times}</p> : null}
      </fieldset>

      <fieldset className="field">
        <legend>Days (leave all unticked for every day)</legend>
        <div className="row wrap">
          {WEEKDAYS.map((name, d) => (
            <label key={name} className="check">
              <input type="checkbox" checked={v.days.includes(d)} onChange={() => toggleDay(d)} /> {name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="row wrap">
        <Field label="Start date" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} error={fields.startDate} required />
        <Field label="End date (optional)" type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} error={fields.endDate} />
      </div>
      <label className="check">
        <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Active (send reminders)
      </label>
      <FormError message={error} />
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
