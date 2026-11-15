"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, api } from "./api";
import type { MedicationValues } from "./medication-form";
import { useSession } from "./session-context";
import { fill } from "@/lib/i18n";
import type { Language } from "@/lib/domain/types";

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
export function PrescriptionScan({
  today,
  onUseDraft,
}: {
  today: string;
  onUseDraft: (v: MedicationValues) => void;
}) {
  const inputId = useId();
  const { announce, t, lang } = useSession();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An error message shown in the old language is dropped on a language switch.
  const errorLang = useRef(lang);
  useEffect(() => {
    if (errorLang.current === lang) return;
    errorLang.current = lang;
    setError(null);
  }, [lang]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDrafts(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError(t("scanBadType"));
    if (file.size > MAX_BYTES) return setError(t("scanTooBig"));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/ai/scan", { method: "POST", body: form, credentials: "same-origin" });
      const data = (await res.json()) as { drafts?: Draft[]; error?: { message: string } };
      if (!res.ok) throw new ApiError(data.error?.message ?? "Scan failed.", res.status);
      setDrafts(data.drafts ?? []);
      announce(fill(t("scanFound"), { n: data.drafts?.length ?? 0 }));
    } catch (e) {
      setError(`${(e as Error).message} ${t("scanByHand")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-card" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className="h3">
        <span aria-hidden="true">✨</span> {t("scanTitle")}
      </h2>
      <p className="muted">{t("scanIntro")}</p>
      <label htmlFor={inputId} className="btn btn-secondary file-label">
        {busy ? t("scanReading") : t("scanChoose")}
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
      {drafts && drafts.length === 0 ? <p>{t("scanNone")}</p> : null}
      {drafts && drafts.length > 0 ? (
        <ul className="plain-list">
          {drafts.map((d, i) => (
            <li key={`${d.name}-${i}`} className="row wrap draft">
              <span>
                <strong>{d.name}</strong> {d.dosage} · {d.times.join(", ") || t("timeNotFound")}{" "}
                {d.instructions ? `· ${d.instructions}` : ""}
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
                {fill(t("reviewName"), { name: d.name })}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small muted">{t("aiMistakes")}</p>
    </section>
  );
}

/** Plain-language explainer for one medicine, in the session language. */
export function ExplainButton({ name, dosage }: { name: string; dosage: string }) {
  const { lang, t } = useSession();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  /** The explanation and the language it was written in, so it is never shown in the wrong language. */
  const [result, setResult] = useState<{ text: string; lang: Language } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  const fetchIn = useCallback(
    async (language: Language) => {
      request.current += 1;
      const id = request.current;
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const res = await api<{ text: string }>("/api/ai/explain", {
          method: "POST",
          body: { name, dosage, language },
        });
        // A newer request (e.g. after another language switch) wins.
        if (id === request.current) setResult({ text: res.text, lang: language });
      } catch (e) {
        if (id === request.current) setError((e as Error).message);
      } finally {
        if (id === request.current) setBusy(false);
      }
    },
    [name, dosage],
  );

  // Language switched: an open explanation is asked again in the new language; a closed one is dropped.
  useEffect(() => {
    if (!result || result.lang === lang) return;
    // Reacting to the language change is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void fetchIn(lang);
    else setResult(null);
  }, [lang, open, result, fetchIn]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (result?.lang === lang) return;
    await fetchIn(lang);
  }
  const text = result?.lang === lang ? result.text : null;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">✨</span> {fill(t("explainName"), { name })}
      </button>
      {open ? (
        <div id={panelId} className="explain-panel" lang={lang} aria-live="polite" aria-busy={busy}>
          {busy ? <p>{t("askingGemini")}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {text ? <div className="explain-text">{text}</div> : null}
        </div>
      ) : null}
    </>
  );
}
