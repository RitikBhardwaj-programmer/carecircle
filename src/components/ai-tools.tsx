"use client";

import { useId, useState } from "react";
import { ApiError, api } from "./api";
import type { MedicationValues } from "./medication-form";
import { useSession } from "./session-context";

interface Draft {
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
}

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Gemini prescription scan. Shows the drafts; each one opens in the normal form,
 * and is saved only when the person presses "Confirm and save".
 */
export function PrescriptionScan({ today, onUseDraft }: { today: string; onUseDraft: (v: MedicationValues) => void }) {
  const inputId = useId();
  const { announce } = useSession();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDrafts(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) return setError("The photo must be smaller than 4 MB.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/ai/scan", { method: "POST", body: form, credentials: "same-origin" });
      const data = (await res.json()) as { drafts?: Draft[]; error?: { message: string } };
      if (!res.ok) throw new ApiError(data.error?.message ?? "Scan failed.", res.status);
      setDrafts(data.drafts ?? []);
      announce(`Found ${data.drafts?.length ?? 0} medicines. Please check each one.`);
    } catch (e) {
      setError(`${(e as Error).message} You can always add the medicine by hand.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-card" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className="h3">
        <span aria-hidden="true">✨</span> Scan a prescription (Gemini)
      </h2>
      <p className="muted">
        Take a photo of the prescription. Gemini suggests a draft schedule. Nothing is saved until you check it and press
        Confirm. The photo is not stored.
      </p>
      <label htmlFor={inputId} className="btn btn-secondary file-label">
        {busy ? "Reading the photo…" : "Choose or take a photo"}
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {drafts && drafts.length === 0 ? <p>No medicines found. Please add them by hand.</p> : null}
      {drafts && drafts.length > 0 ? (
        <ul className="plain-list">
          {drafts.map((d, i) => (
            <li key={`${d.name}-${i}`} className="row wrap draft">
              <span>
                <strong>{d.name}</strong> {d.dosage} · {d.times.join(", ") || "time not found"} {d.instructions ? `· ${d.instructions}` : ""}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  onUseDraft({
                    name: d.name,
                    dosage: d.dosage,
                    instructions: d.instructions,
                    times: d.times.length ? d.times : ["08:00"],
                    days: [],
                    startDate: today,
                    endDate: "",
                    active: true,
                  })
                }
              >
                Review {d.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small muted">AI can make mistakes. This is not medical advice. Ask your doctor or pharmacist.</p>
    </section>
  );
}

/** Plain-language explainer for one medicine, in the session language. */
export function ExplainButton({ name, dosage }: { name: string; dosage: string }) {
  const { lang } = useSession();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ text: string }>("/api/ai/explain", { method: "POST", body: { name, dosage, language: lang } });
      setText(res.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" aria-expanded={open} aria-controls={panelId} onClick={() => void toggle()}>
        <span aria-hidden="true">✨</span> Explain {name}
      </button>
      {open ? (
        <div id={panelId} className="explain-panel" lang={lang} aria-live="polite" aria-busy={busy}>
          {busy ? <p>Asking Gemini…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {text ? <div className="explain-text">{text}</div> : null}
        </div>
      ) : null}
    </>
  );
}
