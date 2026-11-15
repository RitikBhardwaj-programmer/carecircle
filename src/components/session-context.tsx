"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Language, ProfileSettings, Role } from "@/lib/domain/types";
import { translate, type MessageKey } from "@/lib/i18n";

export interface SessionInfo {
  profile: { id: string; code: string; elderName: string; timezone: string; language: Language; settings: ProfileSettings };
  member: { id: string; name: string; email: string | null; role: Role; permission: "view" | "manage" };
  can: { write: boolean; manageCircle: boolean };
}

interface SessionValue extends SessionInfo {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey) => string;
  /** Announces a message in the shared aria-live region. */
  announce: (message: string) => void;
  status: string;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionInfo; children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(value.profile.language);
  const [status, setStatus] = useState("");
  const announce = useCallback((message: string) => {
    // Clear first so repeating the same message is announced again.
    setStatus("");
    window.setTimeout(() => setStatus(message), 50);
  }, []);
  const ctx = useMemo<SessionValue>(
    () => ({ ...value, lang, setLang, t: (k) => translate(lang, k), announce, status }),
    [value, lang, announce, status],
  );
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
