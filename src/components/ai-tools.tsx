"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, api } from "./api";
import { Icon } from "./icon";
import { medicationBody, MedicationForm, type MedicationValues } from "./medication-form";
import { useSession } from "./session-context";
import { fill, type MessageKey } from "@/lib/i18n";
import type { Language } from "@/lib/domain/types";

interface Draft {
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
}

const MAX_BYTES = 4 * 1024 * 1024;

type DraftStatus = "pending" | "saving" | "saved" | "error";

interface ReviewDraft {
  key: number;
  values: MedicationValues;
  include: boolean;
  status: DraftStatus;
  error: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What a draft still needs before it can be saved (empty when it is complete). */
export function draftProblems(v: MedicationValues): MessageKey[] {
  const problems: MessageKey[] = [];
  if (!v.name.trim()) problems.push("fnName");
  if (!v.dosage.trim()) problems.push("fnDosage");
  if (v.times.length === 0 || v.times.some((x) => !TIME_RE.test(x))) problems.push("fnTimes");
  return problems;
}

/**
 * Gemini prescription scan with a review step. One photo gives a list of drafts that stays on screen
 * until the person closes it: each draft can be edited in the normal form, unticked or removed, and
 * "Save N medicines" saves the ticked, complete ones through the normal POST /api/medications.
 * Nothing is saved without a person pressing a Save button.
 */
export function PrescriptionScan({ today, onSaved }: { today: string; onSaved: () => void }) {
  const inputId = useId();
  const { announce, t, lang } = useSession();
  const [drafts, setDrafts] = useState<ReviewDraft[] | null>(null);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const focusReview = useRef(false);
  // An error message shown in the old language is dropped on a language switch.
  const errorLang = useRef(lang);
  useEffect(() => {
    if (errorLang.current === lang) return;
    errorLang.current = lang;
    setError(null);
  }, [lang]);
  useEffect(() => {
    if (!focusReview.current || !drafts) return;
    focusReview.current = false;
    reviewHeading.current?.focus();
  }, [drafts]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDrafts(null);
    setEditingKey(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError(t("scanBadType"));
    if (file.size > MAX_BYTES) return setError(t("scanTooBig"));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/ai/scan", { method: "POST", body: form, credentials: "same-origin" });
      const data = (await res.json()) as { drafts?: Draft[]; error?: { message: string } };
      if (!res.ok) throw new ApiError(data.error?.message ?? "Scan failed.", res.status);
      const list = (data.drafts ?? []).map<ReviewDraft>((d, i) => {
        const values: MedicationValues = {
          name: d.name,
          dosage: d.dosage,
          instructions: d.instructions,
          times: d.times,
          days: [],
          startDate: today,
          endDate: "",
          active: true,
        };
        return {
          key: i,
          values,
          include: draftProblems(values).length === 0,
          status: "pending",
          error: null,
        };
      });
      focusReview.current = true;
      setDrafts(list);
      announce(fill(t("scanFound"), { n: list.length }));
    } catch (e) {
      setError(`${(e as Error).message} ${t("scanByHand")}`);
    } finally {
      setBusy(false);
    }
  }

  const update = (key: number, patch: Partial<ReviewDraft>) =>
    setDrafts((cur) => cur?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);

  /** Saves the given drafts one after another; each card shows its own result. */
  async function saveDrafts(list: ReviewDraft[]) {
    setSaving(true);
    let ok = 0;
    for (const d of list) {
      update(d.key, { status: "saving", error: null });
      try {
        await api("/api/medications", { method: "POST", body: medicationBody(d.values) });
        update(d.key, { status: "saved", include: false });
        ok += 1;
      } catch (e) {
        update(d.key, { status: "error", error: (e as Error).message });
      }
    }
    setSaving(false);
    if (ok > 0) {
      announce(fill(t("savedCount"), { n: ok }));
      onSaved();
    }
  }

  const saveable = (d: ReviewDraft) => d.status !== "saved" && draftProblems(d.values).length === 0;
  const chosen = drafts?.filter((d) => d.include && saveable(d)) ?? [];
  const unsaved = drafts?.some((d) => d.status !== "saved") ?? false;
  const editing = drafts?.find((d) => d.key === editingKey) ?? null;

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
        disabled={busy || saving}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {drafts && drafts.length === 0 ? <p>{t("scanNone")}</p> : null}

      {drafts && drafts.length > 0 ? (
        <section className="scan-review" aria-labelledby={`${inputId}-review`}>
          <h3 id={`${inputId}-review`} tabIndex={-1} ref={reviewHeading}>
            {fill(t("reviewTitle"), { n: drafts.length })}
          </h3>
          <p className="notice">{t("reviewIntro")}</p>
          <ul className="card-list">
            {drafts.map((d) => {
              const problems = draftProblems(d.values);
              const name = d.values.name || "—";
              const checkId = `${inputId}-inc-${d.key}`;
              if (editing?.key === d.key) {
                return (
                  <li key={d.key}>
                    <MedicationForm
                      initial={d.values}
                      title={fill(t("editName"), { name })}
                      submitLabel={t("updateDraft")}
                      t={t}
                      onSubmit={(values) => {
                        update(d.key, { values, include: draftProblems(values).length === 0 });
                        setEditingKey(null);
                      }}
                      onCancel={() => setEditingKey(null)}
                    />
                  </li>
                );
              }
              return (
                <li key={d.key} className={`card draft-card status-${d.status}`}>
                  <h4 className="draft-name">
                    {name} <span className="muted">{d.values.dosage}</span>
                  </h4>
                  <p>
                    <Icon name="clock" /> {d.values.times.join(", ") || t("timeNotFound")} · {t("everyDay")}
                  </p>
                  {d.values.instructions ? <p className="muted">{d.values.instructions}</p> : null}
                  {problems.length > 0 && d.status !== "saved" ? (
                    <p className="error">
                      <Icon name="alert" />
                      {fill(t("needsFix"), { what: problems.map((k) => t(k)).join(", ") })}
                    </p>
                  ) : null}
                  {d.status === "saved" ? (
                    <p className="draft-saved">
                      <Icon name="check" /> {t("savedWord")}
                    </p>
                  ) : null}
                  {d.status === "error" ? (
                    <p className="error" role="alert">
                      <Icon name="alert" /> {d.error}
                    </p>
                  ) : null}
                  {d.status !== "saved" ? (
                    <div className="item-actions">
                      <label className="check" htmlFor={checkId}>
                        <input
                          id={checkId}
                          type="checkbox"
                          checked={d.include && problems.length === 0}
                          disabled={problems.length > 0 || saving}
                          onChange={(e) => update(d.key, { include: e.target.checked })}
                        />
                        {t("addThis")}
                        <span className="sr-only">{fill(t("forName"), { name })}</span>
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={saving}
                        onClick={() => setEditingKey(d.key)}
                      >
                        {fill(t("editName"), { name })}
                      </button>
                      {d.status === "error" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={saving || problems.length > 0}
                          onClick={() => void saveDrafts([d])}
                        >
                          {fill(t("retryName"), { name })}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={saving || problems.length > 0}
                          onClick={() => void saveDrafts([d])}
                        >
                          {fill(t("saveOnly"), { name })}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={saving}
                        onClick={() => setDrafts((cur) => cur?.filter((x) => x.key !== d.key) ?? null)}
                      >
                        {fill(t("removeName"), { name })}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="row wrap">
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={saving || chosen.length === 0 || editing !== null}
              onClick={() => void saveDrafts(chosen)}
            >
              {saving
                ? t("saving")
                : chosen.length === 1
                  ? t("saveOne")
                  : fill(t("saveN"), { n: chosen.length })}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={saving}
              onClick={() => {
                setDrafts(null);
                setEditingKey(null);
              }}
            >
              {unsaved ? t("discardRest") : t("done")}
            </button>
          </div>
        </section>
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
