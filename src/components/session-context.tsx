"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Language, ProfileSettings, Role } from "@/lib/domain/types";
import { translate, type MessageKey } from "@/lib/i18n";

export interface SessionInfo {
  profile: {
    id: string;
    code: string;
    elderName: string;
    timezone: string;
    language: Language;
    settings: ProfileSettings;
  };
  member: { id: string; name: string; email: string | null; role: Role; permission: "view" | "manage" };
  can: { write: boolean; manageCircle: boolean };
}

/** Optional button shown in the toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

interface SessionValue extends SessionInfo {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey) => string;
  /** Shows a message in the shared live region (visible toast). An action adds a button such as Undo. */
  announce: (message: string, action?: ToastAction) => void;
  dismissToast: () => void;
  toast: Toast | null;
  /** Text of the current toast, kept for callers that only need the message. */
  status: string;
}

const Ctx = createContext<SessionValue | null>(null);

/** How long a toast stays: longer when it offers an action, so there is time to press Undo. */
const TOAST_MS = 6_000;
const TOAST_ACTION_MS = 10_000;

export function SessionProvider({ value, children }: { value: SessionInfo; children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(value.profile.language);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const announce = useCallback((message: string, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    // Clear first so repeating the same message is announced again.
    setToast(null);
    counter.current += 1;
    const id = counter.current;
    window.setTimeout(() => setToast({ id, message, action }), 50);
    timer.current = window.setTimeout(
      () => setToast((cur) => (cur?.id === id ? null : cur)),
      (action ? TOAST_ACTION_MS : TOAST_MS) + 50,
    );
  }, []);

  const ctx = useMemo<SessionValue>(
    () => ({
      ...value,
      lang,
      setLang,
      t: (k) => translate(lang, k),
      announce,
      dismissToast,
      toast,
      status: toast?.message ?? "",
    }),
    [value, lang, announce, dismissToast, toast],
  );
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
