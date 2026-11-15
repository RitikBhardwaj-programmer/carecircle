"use client";

import { useEffect, useId, useRef, useState } from "react";
import { translate, fill, type MessageKey } from "@/lib/i18n";
import { ErrorSummary } from "./feedback";
import { Field } from "./field";
import { Icon } from "./icon";

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

const WEEKDAY_KEYS: MessageKey[] = ["wd0", "wd1", "wd2", "wd3", "wd4", "wd5", "wd6"];

type T = (key: MessageKey) => string;
const english: T = (k) => translate("en", k);

/** Quick picks for common times; typed times stay available for anything else. */
const TIME_CHIPS: Array<{ label: MessageKey; time: string }> = [
  { label: "morning", time: "08:00" },
  { label: "afternoon", time: "14:00" },
  { label: "evening", time: "18:00" },
  { label: "night", time: "21:00" },
];

export function emptyMedication(today: string): MedicationValues {
  return {
    name: "",
    dosage: "",
    instructions: "",
    times: ["08:00"],
    days: [],
    startDate: today,
    endDate: "",
    active: true,
  };
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
  /** Translator from the session; English when the form is used on its own (tests). */
  t?: T;
}

/**
 * Add / edit form for a medication schedule, in three numbered groups.
 * Every input has a label; an error summary links to each field, and errors sit under their inputs.
 */
const FIELD_NAMES: Record<string, MessageKey> = {
  name: "fnName",
  dosage: "fnDosage",
  instructions: "fnInstructions",
  times: "fnTimes",
  startDate: "fnStart",
  endDate: "fnEnd",
};

/** Turns raw validation text from the server into a sentence that says how to fix it. */
export function friendlyFieldErrors(fields: Record<string, string>, t: T = english): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, message]) => {
      const whatKey = FIELD_NAMES[key.split(".")[0] ?? key];
      if (!whatKey) return [key, message];
      const what = t(whatKey);
      if (/too small|>=\s*1|required|expected/i.test(message)) return [key, fill(t("enterWhat"), { what })];
      if (/too big|<=/i.test(message)) return [key, fill(t("shorterWhat"), { what })];
      if (/HH:mm/.test(message)) return [key, t("useTimeLike")];
      return [key, message];
    }),
  );
}

export function MedicationForm({
  initial,
  submitLabel,
  title,
  error = null,
  fields: rawFields = {},
  busy = false,
  onSubmit,
  onCancel,
  t = english,
}: Props) {
  const [v, setV] = useState<MedicationValues>(initial);
  const uid = useId();
  const fields = friendlyFieldErrors(rawFields, t);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openedWithError = useRef(Boolean(error));
  // Opening the form moves focus to its heading; an error summary takes focus itself instead.
  useEffect(() => {
    if (!openedWithError.current) headingRef.current?.focus();
  }, []);
  const ids = {
    name: `${uid}-name`,
    dosage: `${uid}-dosage`,
    instructions: `${uid}-instructions`,
    times: `${uid}-time-0`,
    startDate: `${uid}-start`,
    endDate: `${uid}-end`,
  };
  const set = <K extends keyof MedicationValues>(k: K, value: MedicationValues[K]) =>
    setV((old) => ({ ...old, [k]: value }));

  function setTime(i: number, value: string) {
    set(
      "times",
      v.times.map((tm, j) => (j === i ? value : tm)),
    );
  }
  function toggleDay(d: number) {
    set("days", v.days.includes(d) ? v.days.filter((x) => x !== d) : [...v.days, d].sort());
  }
  function toggleChip(time: string) {
    if (v.times.includes(time)) {
      if (v.times.length > 1)
        set(
          "times",
          v.times.filter((tm) => tm !== time),
        );
    } else if (v.times.length < 8) {
      set("times", [...v.times, time].sort());
    }
  }

  return (
    <form
      className="card panel"
      aria-label={title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2 tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      {error ? <ErrorSummary title={t("errorTitle")} message={error} fields={fields} fieldIds={ids} /> : null}

      <fieldset className="form-group">
        <legend>
          <span className="step-num" aria-hidden="true">
            1
          </span>
          {t("stepWhat")}
        </legend>
        <Field
          id={ids.name}
          label={t("medName")}
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          error={fields.name}
          required
          maxLength={80}
        />
        <Field
          id={ids.dosage}
          label={t("dosage")}
          hint={t("dosageHint")}
          value={v.dosage}
          onChange={(e) => set("dosage", e.target.value)}
          error={fields.dosage}
          required
          maxLength={60}
        />
        <Field
          id={ids.instructions}
          label={t("instructionsOpt")}
          hint={t("instructionsHint")}
          value={v.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          error={fields.instructions}
          maxLength={300}
        />
      </fieldset>

      <fieldset className="form-group">
        <legend>
          <span className="step-num" aria-hidden="true">
            2
          </span>
          {t("stepWhen")}
        </legend>
        <p className="hint" id={`${uid}-chips`}>
          {t("chipsHint")}
        </p>
        <div className="chips" role="group" aria-labelledby={`${uid}-chips`}>
          {TIME_CHIPS.map((c) => (
            <button
              key={c.time}
              type="button"
              className="chip"
              aria-pressed={v.times.includes(c.time)}
              onClick={() => toggleChip(c.time)}
            >
              {v.times.includes(c.time) ? <Icon name="check" /> : null}
              {t(c.label)} {c.time}
            </button>
          ))}
        </div>
        {v.times.map((time, i) => (
          <div key={i} className="time-row">
            <div className="field">
              <label htmlFor={`${uid}-time-${i}`}>{fill(t("timeN"), { n: i + 1 })}</label>
              <input
                id={`${uid}-time-${i}`}
                type="time"
                value={time}
                onChange={(e) => setTime(i, e.target.value)}
                required
              />
            </div>
            {v.times.length > 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  set(
                    "times",
                    v.times.filter((_, j) => j !== i),
                  )
                }
              >
                {fill(t("removeTimeN"), { n: i + 1 })}
              </button>
            ) : null}
          </div>
        ))}
        {v.times.length < 8 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => set("times", [...v.times, "20:00"])}
          >
            <Icon name="plus" />
            {t("addATime")}
          </button>
        ) : null}
        {fields.times ? <p className="error">{fields.times}</p> : null}

        <fieldset className="field">
          <legend>{t("daysLegend")}</legend>
          <div className="row wrap">
            {WEEKDAY_KEYS.map((key, d) => (
              <label key={key} className="check">
                <input type="checkbox" checked={v.days.includes(d)} onChange={() => toggleDay(d)} /> {t(key)}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="form-group">
        <legend>
          <span className="step-num" aria-hidden="true">
            3
          </span>
          {t("stepHowLong")}
        </legend>
        <div className="row wrap">
          <Field
            id={ids.startDate}
            label={t("startDate")}
            type="date"
            value={v.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            error={fields.startDate}
            required
          />
          <Field
            id={ids.endDate}
            label={t("endDateOpt")}
            type="date"
            value={v.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            error={fields.endDate}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} />{" "}
          {t("activeLabel")}
        </label>
      </fieldset>

      <div className="row wrap">
        <button type="submit" className="btn btn-primary btn-big" disabled={busy}>
          {busy ? t("saving") : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t("cancel")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
