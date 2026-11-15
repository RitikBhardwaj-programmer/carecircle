"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useSession } from "./session-context";
import type { MessageKey } from "@/lib/i18n";

const NAV: Array<{ href: string; key: MessageKey }> = [
  { href: "/home", key: "navHome" },
  { href: "/medications", key: "navMedications" },
  { href: "/appointments", key: "navAppointments" },
  { href: "/circle", key: "navCircle" },
  { href: "/activity", key: "navActivity" },
];

const ELDER_MODE_KEY = "cc-elder-mode";

/** Reads the Elder Mode preference; the elder gets it on by default. */
export function useElderMode(defaultOn: boolean): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(defaultOn);
  useEffect(() => {
    const saved = window.localStorage.getItem(ELDER_MODE_KEY);
    // Reading browser storage must happen after hydration, so this runs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setOn(saved === "1");
  }, []);
  const update = (v: boolean) => {
    setOn(v);
    window.localStorage.setItem(ELDER_MODE_KEY, v ? "1" : "0");
    window.dispatchEvent(new Event("cc-elder-mode"));
  };
  useEffect(() => {
    const sync = () => setOn(window.localStorage.getItem(ELDER_MODE_KEY) === "1");
    window.addEventListener("cc-elder-mode", sync);
    return () => window.removeEventListener("cc-elder-mode", sync);
  }, []);
  return [on, update];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, member, t, lang, setLang, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [elderMode, setElderMode] = useElderMode(member.role === "elder");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
    router.refresh();
  }

  return (
    <div lang={lang} className={elderMode ? "shell elder-mode" : "shell"}>
      <header className="topbar">
        <div className="container topbar-inner">
          <p className="brand">
            <span aria-hidden="true">💙</span> {t("appName")}
            <span className="brand-sub">
              {profile.elderName} · {member.name} ({member.role})
            </span>
          </p>
          <div className="toolbar">
            <label className="switch">
              <input type="checkbox" checked={elderMode} onChange={(e) => setElderMode(e.target.checked)} />
              {t("elderMode")}
            </label>
            <label className="sr-only" htmlFor="lang-select">
              Language
            </label>
            <select id="lang-select" value={lang} onChange={(e) => setLang(e.target.value === "hi" ? "hi" : "en")}>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              {t("logout")}
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="container">
          <ul className="nav">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={pathname === n.href ? "page" : undefined}>
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        {children}
      </main>
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
      <footer className="container footer">
        <p>
          {t("tagline")} · {t("notMedicalAdvice")}
        </p>
      </footer>
    </div>
  );
}
