"use client";

import { useCallback, useEffect, useState } from "react";
import type { Medication } from "@/lib/domain/types";
import { fill, type MessageKey } from "@/lib/i18n";
import { api, ApiError } from "./api";
import { emptyMedication, MedicationForm, type MedicationValues } from "./medication-form";
import { useSession } from "./session-context";
import { ExplainButton, PrescriptionScan } from "./ai-tools";
import { takeAssistDraft } from "./assistant";
import { EmptyState, Skeleton } from "./feedback";
import { Icon } from "./icon";

const WEEKDAY_KEYS: MessageKey[] = ["wd0", "wd1", "wd2", "wd3", "wd4", "wd5", "wd6"];

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function toBody(v: MedicationValues) {
  return {
    name: v.name,
    dosage: v.dosage,
    instructions: v.instructions || null,
    times: v.times,
    days: v.days,
    startDate: v.startDate,
    endDate: v.endDate || null,
    active: v.active,
  };
}

function toValues(m: Medication): MedicationValues {
  return { ...m, instructions: m.instructions ?? "", endDate: m.endDate ?? "" };
}

export function MedicationsView() {
  const { profile, can, t, announce } = useSession();
  const [meds, setMeds] = useState<Medication[] | null>(null);
  const [editing, setEditing] = useState<Medication | "new" | null>(null);
  const [prefill, setPrefill] = useState<MedicationValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeds((await api<{ medications: Medication[] }>("/api/medications")).medications);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Initial data fetch for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // A medicine proposed by "Ask CareCircle" opens the form pre-filled; nothing is saved until Save.
  useEffect(() => {
    const draft = can.write ? takeAssistDraft("medication") : null;
    if (!draft) return;
    const base = emptyMedication(todayIn(profile.timezone));
    const times = Array.isArray(draft.times)
      ? draft.times.filter((x): x is string => typeof x === "string")
      : [];
    // Reading the draft from session storage must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefill({
      ...base,
      name: typeof draft.name === "string" ? draft.name : "",
      dosage: typeof draft.dosage === "string" ? draft.dosage : "",
      instructions: typeof draft.instructions === "string" ? draft.instructions : "",
      times: times.length ? times : base.times,
    });
    setEditing("new");
  }, [can.write, profile.timezone]);

  async function save(v: MedicationValues) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (editing && editing !== "new") {
        await api(`/api/medications/${editing.id}`, { method: "PUT", body: toBody(v) });
      } else {
        await api("/api/medications", { method: "POST", body: toBody(v) });
      }
      announce(fill(t("savedName"), { name: v.name }));
      setEditing(null);
      setPrefill(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setFields(e.fields);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Medication) {
    if (!window.confirm(fill(t("confirmRemoveMed"), { name: m.name }))) return;
    try {
      await api(`/api/medications/${m.id}`, { method: "DELETE" });
      announce(fill(t("removedName"), { name: m.name }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const today = todayIn(profile.timezone);

  return (
    <section aria-labelledby="meds-title">
      <h1 id="meds-title">{t("navMedications")}</h1>
      {!can.write ? <p className="notice">{t("viewOnlyNotice")}</p> : null}

      {can.write && editing === null ? (
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" />
            {t("addMedication")}
          </button>
        </div>
      ) : null}

      {can.write && editing === null ? (
        <PrescriptionScan
          today={today}
          onUseDraft={(draft) => {
            setPrefill(draft);
            setEditing("new");
          }}
        />
      ) : null}

      {editing !== null ? (
        <MedicationForm
          key={editing === "new" ? `new-${prefill?.name ?? ""}` : editing.id}
          title={editing === "new" ? t("addMedication") : fill(t("editName"), { name: editing.name })}
          submitLabel={editing === "new" ? t("confirmAndSave") : t("saveChanges")}
          t={t}
          initial={editing === "new" ? (prefill ?? emptyMedication(today)) : toValues(editing)}
          error={error}
          fields={fields}
          busy={busy}
          onSubmit={save}
          onCancel={() => {
            setEditing(null);
            setPrefill(null);
            setError(null);
            setFields({});
          }}
        />
      ) : error ? (
        <p role="alert">{error}</p>
      ) : null}

      {meds === null ? (
        <Skeleton label={t("loading")} />
      ) : meds.length === 0 ? (
        <EmptyState
          icon="pill"
          text={t("noMedicines")}
          action={
            can.write && editing === null
              ? { label: t("addFirstMedicine"), onClick: () => setEditing("new") }
              : undefined
          }
        />
      ) : (
        <ul className="card-list">
          {meds.map((m) => (
            <li key={m.id} className="card item-card">
              <div className="item-main">
                <h2 className="h3">
                  <Icon name="pill" /> {m.name} <span className="muted">{m.dosage}</span>{" "}
                  {!m.active ? <span className="badge">{t("paused")}</span> : null}
                </h2>
                <p>
                  <Icon name="clock" /> {m.times.join(", ")} ·{" "}
                  {m.days.length === 0 ? t("everyDay") : m.days.map((d) => t(WEEKDAY_KEYS[d]!)).join(", ")} ·{" "}
                  {fill(t("fromDate"), { date: m.startDate })}
                  {m.endDate ? ` ${fill(t("toDate"), { date: m.endDate })}` : ""}
                </p>
                {m.instructions ? <p className="muted">{m.instructions}</p> : null}
                <p className="muted small">{fill(t("lastChangedBy"), { name: m.updatedBy })}</p>
              </div>
              <div className="item-actions">
                <ExplainButton name={m.name} dosage={m.dosage} />
                {can.write ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEditing(m)}
                      aria-label={fill(t("editName"), { name: m.name })}
                    >
                      {t("editBtn")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void remove(m)}
                      aria-label={fill(t("removeName"), { name: m.name })}
                    >
                      {t("removeBtn")}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
