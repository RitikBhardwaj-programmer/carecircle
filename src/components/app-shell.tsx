"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Icon, LogoMark, type IconName } from "./icon";
import { useSession } from "./session-context";
import type { MessageKey } from "@/lib/i18n";

interface NavItem {
  href: string;
  key: MessageKey;
  short: MessageKey;
  icon: IconName;
  /** Shown in the top bar on wide screens only; on phones it is linked from the Circle page. */
  wideOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/home", key: "navHome", short: "navHome", icon: "today" },
  { href: "/medications", key: "navMedications", short: "tabMedications", icon: "pill" },
  { href: "/appointments", key: "navAppointments", short: "tabAppointments", icon: "calendar" },
  { href: "/circle", key: "navCircle", short: "tabCircle", icon: "users" },
  { href: "/activity", key: "navActivity", short: "navActivity", icon: "activity", wideOnly: true },
  { href: "/home#ask", key: "navAsk", short: "navAsk", icon: "ask" },
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
  const { profile, member, t, lang, setLang, toast, dismissToast } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [elderMode, setElderMode] = useElderMode(member.role === "elder");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Elder Mode sits on <html>, so the root font size (and every rem) grows with it.
  useEffect(() => {
    document.documentElement.classList.toggle("elder-mode", elderMode);
    return () => document.documentElement.classList.remove("elder-mode");
  }, [elderMode]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
    router.refresh();
  }

  return (
    <div lang={lang} className="shell has-tabbar">
      <header className="topbar">
        <div className="container topbar-inner">
          <p className="brand">
            <LogoMark />
            <span>
              {t("appName")}
              <span className="brand-sub">
                {profile.elderName} · {member.name} ({member.role})
              </span>
            </span>
          </p>
          <div className="toolbar">
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={elderMode}
                onChange={(e) => setElderMode(e.target.checked)}
              />
              {t("elderMode")}
            </label>
            <label className="sr-only" htmlFor="lang-select">
              Language
            </label>
            <select
              id="lang-select"
              value={lang}
              onChange={(e) => setLang(e.target.value === "hi" ? "hi" : "en")}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              <Icon name="logout" />
              {t("logout")}
            </button>
          </div>
        </div>
      </header>
      <nav aria-label="Main" className="mainnav">
        <ul className="nav">
          {NAV.map((n) => (
            <li key={n.href} className={n.wideOnly ? "nav-wide-only" : undefined}>
              <Link href={n.href} aria-current={pathname === n.href ? "page" : undefined}>
                <Icon name={n.icon} />
                <span className="nav-label-long">{t(n.key)}</span>
                <span className="nav-label-short" aria-hidden="true">
                  {t(n.short)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="container" tabIndex={-1}>
        {children}
      </main>
      {/* The only live region: screen readers hear each message once, sighted users see it as a toast. */}
      <div role="status" aria-live="polite" className="toast-region">
        {toast ? (
          <div className="toast" key={toast.id}>
            <p>
              <Icon name="info" />
              {toast.message}
            </p>
            <span className="row">
              {toast.action ? (
                <button
                  type="button"
                  className="btn btn-small toast-action"
                  onClick={() => {
                    toast.action?.onAction();
                    dismissToast();
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-small toast-action"
                onClick={dismissToast}
                aria-label={t("close")}
              >
                <Icon name="close" />
              </button>
            </span>
          </div>
        ) : null}
      </div>
      <footer className="container footer">
        <p>
          {t("tagline")} · {t("notMedicalAdvice")}
        </p>
      </footer>
    </div>
  );
}
