"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { fill, speechLang, type MessageKey } from "@/lib/i18n";
import { api } from "./api";
import { Icon } from "./icon";
import { ReadAloudButton } from "./read-aloud";
import { useSession } from "./session-context";

/** Key under which a proposed medicine or appointment waits for the form on the next page. */
export const ASSIST_DRAFT_KEY = "cc-assist-draft";

export interface AssistDraft {
  kind: "medication" | "appointment";
  data: Record<string, unknown>;
}

/** Reads and clears a draft left by the assistant for the given form. */
export function takeAssistDraft(kind: AssistDraft["kind"]): Record<string, unknown> | null {
  try {
    const raw = window.sessionStorage.getItem(ASSIST_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as AssistDraft;
    if (draft.kind !== kind) return null;
    window.sessionStorage.removeItem(ASSIST_DRAFT_KEY);
    return draft.data;
  } catch {
    return null;
  }
}

type DoseState = "taken" | "skipped" | "missed" | "due" | "upcoming";
type Result =
  | { type: "answer" | "refuse"; reply: string; fallback?: true }
  | { type: "navigate"; reply: string; route: string }
  | {
      type: "mark_dose";
      reply: string;
      doseId: string;
      status: "taken" | "skipped";
      dose: { id: string; name: string; dosage: string; time: string; state: DoseState };
    }
  | { type: "add_medication"; reply: string; medication: Record<string, unknown> }
  | { type: "add_appointment"; reply: string; appointment: Record<string, unknown> };

const PAGE_KEY: Record<string, MessageKey> = {
  "/home": "navHome",
  "/medications": "navMedications",
  "/appointments": "navAppointments",
  "/circle": "navCircle",
  "/activity": "navActivity",
};

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface AssistantProps {
  /** Marks a dose through the same path as the dose card (POST /api/doses, then the Undo toast). */
  onMark: (doseId: string, status: "taken" | "skipped") => Promise<void> | void;
}

/**
 * "Ask CareCircle": type or speak a wish in plain words. Answers are shown and can be read aloud.
 * Any change is only proposed: a confirm card (Yes / No) or a pre-filled form that a person saves.
 */
export function Assistant({ onMark }: AssistantProps) {
  const { t, lang, can } = useSession();
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // Feature detection must run in the browser after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanSpeak(speechCtor() !== null);
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    if (result?.type === "mark_dose") confirmRef.current?.focus();
  }, [result]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setNote(null);
    setResult(null);
    try {
      const res = await api<Result>("/api/ai/assist", { method: "POST", body: { text: question, lang } });
      if (res.type === "navigate") {
        setResult(res);
        router.push(res.route);
        return;
      }
      if (res.type === "add_medication" || res.type === "add_appointment") {
        const draft: AssistDraft =
          res.type === "add_medication"
            ? { kind: "medication", data: res.medication }
            : { kind: "appointment", data: res.appointment };
        try {
          window.sessionStorage.setItem(ASSIST_DRAFT_KEY, JSON.stringify(draft));
        } catch {
          /* storage blocked: the form opens empty */
        }
        setResult(res);
        router.push(res.type === "add_medication" ? "/medications?draft=1" : "/appointments?draft=1");
        return;
      }
      setResult(res);
    } catch (e) {
      setResult({ type: "answer", reply: (e as Error).message || t("askFailed"), fallback: true });
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = speechLang(lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      setText(said);
      void ask(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function confirm(yes: boolean) {
    if (result?.type !== "mark_dose") return;
    const { doseId, status } = result;
    setResult(null);
    if (!yes) {
      setNote(t("askNothingChanged"));
      return;
    }
    await onMark(doseId, status);
  }

  const examples: MessageKey[] = ["askEx1", "askEx2", "askEx3"];

  return (
    <section id="ask" className="card assistant" aria-labelledby="ask-title">
      <h2 id="ask-title">
        <Icon name="ask" />
        {t("askTitle")}
      </h2>
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <div className="field">
          <label htmlFor={inputId}>{t("askLabel")}</label>
          <p className="hint" id={hintId}>
            {t("askHint")}
          </p>
          <input
            id={inputId}
            type="text"
            value={text}
            maxLength={300}
            autoComplete="off"
            aria-describedby={hintId}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          <Icon name="send" />
          {t("askSend")}
        </button>
        {canSpeak ? (
          <button type="button" className="btn btn-secondary" onClick={listen} aria-pressed={listening}>
            <Icon name="mic" />
            {listening ? t("askListening") : t("askSpeak")}
          </button>
        ) : null}
      </form>
      <p className="eyebrow" id="ask-examples">
        {t("askExamples")}
      </p>
      <div className="chips" role="group" aria-labelledby="ask-examples">
        {examples.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => {
              setText(t(k));
              void ask(t(k));
            }}
          >
            {t(k)}
          </button>
        ))}
      </div>

      <div className="assistant-reply" aria-live="polite" aria-busy={busy}>
        {busy ? <p className="muted">{t("askThinking")}</p> : null}
        {note ? <p>{note}</p> : null}
        {result && (result.type === "answer" || result.type === "refuse") ? (
          <>
            <p className={`assistant-answer${result.type === "refuse" ? " assistant-refuse" : ""}`}>
              {result.reply}
            </p>
            <ReadAloudButton
              text={result.reply}
              lang={lang}
              label={t("readAloud")}
              stopLabel={t("stopReading")}
            />
          </>
        ) : null}
        {result?.type === "navigate" ? (
          <p>{fill(t("askOpened"), { page: t(PAGE_KEY[result.route] ?? "navHome") })}</p>
        ) : null}
        {result?.type === "add_medication" || result?.type === "add_appointment" ? (
          <p>{t("askOpenForm")}</p>
        ) : null}
        {result?.type === "mark_dose" && can.write ? (
          <div className="confirm-card">
            <h3 tabIndex={-1} ref={confirmRef}>
              {t("askConfirmTitle")}
            </h3>
            <p className="big-text">
              <strong>
                {result.dose.time} · {result.dose.name}
              </strong>{" "}
              <span className="muted">{result.dose.dosage}</span>
            </p>
            <p>{fill(t("askConfirmMark"), { status: t(result.status) })}</p>
            {result.reply ? <p className="muted">{result.reply}</p> : null}
            <div className="row wrap">
              <button type="button" className="btn btn-primary btn-big" onClick={() => void confirm(true)}>
                <Icon name="check" />
                {t("askYes")}
              </button>
              <button type="button" className="btn btn-ghost btn-big" onClick={() => void confirm(false)}>
                {t("askNo")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
