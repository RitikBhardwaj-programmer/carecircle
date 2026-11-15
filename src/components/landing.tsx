"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/domain/types";
import { fill, translate, type MessageKey } from "@/lib/i18n";
import { api, ApiError } from "./api";
import { Field, FormError } from "./field";
import { LogoMark } from "./icon";
import { LoginForm } from "./login-form";
import { ThemeSelect } from "./theme";

type T = (key: MessageKey) => string;

interface Created {
  profile: { code: string; elderName: string };
  passcode: string;
}

/** Same key as the in-app language switch, so a choice made here carries into the app. */
const LANG_KEY = "cc-lang";

function useLandingLang(): [Language, (l: Language) => void] {
  const [lang, setLang] = useState<Language>("en");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      // Reading browser storage must happen after hydration, so this runs in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "en" || saved === "hi") setLang(saved);
    } catch {
      /* storage blocked: English */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const update = (l: Language) => {
    setLang(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  };
  return [lang, update];
}

function CreateProfileForm({
  onCreated,
  t,
  lang,
}: {
  onCreated: (c: Created) => void;
  t: T;
  lang: Language;
}) {
  const [elderName, setElderName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<Language | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const profileLanguage = language ?? lang;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      const res = await api<Created>("/api/profiles", {
        method: "POST",
        body: { elderName, email: email || null, language: profileLanguage, timezone },
      });
      onCreated(res);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="create-title" className="card">
      <h2 id="create-title">{t("createTitle")}</h2>
      <p className="muted">{t("createIntro")}</p>
      <Field
        label={t("elderNameLabel")}
        name="elderName"
        autoComplete="name"
        value={elderName}
        onChange={(e) => setElderName(e.target.value)}
        error={fields.elderName}
        required
        maxLength={80}
      />
      <Field
        label={t("elderEmailLabel")}
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fields.email}
        maxLength={254}
      />
      <div className="field">
        <label htmlFor="create-language">{t("language")}</label>
        <select
          id="create-language"
          value={profileLanguage}
          onChange={(e) => setLanguage(e.target.value === "hi" ? "hi" : "en")}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
        </select>
      </div>
      <FormError message={error} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t("creating") : t("createProfile")}
      </button>
    </form>
  );
}

function Credentials({ created, onContinue, t }: { created: Created; onContinue: () => void; t: T }) {
  return (
    <section className="card credentials" aria-labelledby="cred-title">
      <h2 id="cred-title">{t("credTitle")}</h2>
      <p>{fill(t("credText"), { name: created.profile.elderName })}</p>
      <dl className="cred-list">
        <dt>{t("profileCode")}</dt>
        <dd>
          <code>{created.profile.code}</code>
        </dd>
        <dt>{t("elderPasscode")}</dt>
        <dd>
          <code>{created.passcode}</code>
        </dd>
      </dl>
      <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
        {t("savedContinue")}
      </button>
    </section>
  );
}

const FEATURES: Array<[MessageKey, MessageKey]> = [
  ["f1t", "f1d"],
  ["f2t", "f2d"],
  ["f3t", "f3d"],
  ["f4t", "f4d"],
  ["f5t", "f5d"],
];

/** The public front page: language and theme controls, log in or create a profile, and what the app does. */
export function Landing() {
  const router = useRouter();
  const [lang, setLang] = useLandingLang();
  const t: T = (k) => translate(lang, k);
  const [created, setCreated] = useState<Created | null>(null);
  const goHome = () => {
    router.replace("/home");
    router.refresh();
  };

  return (
    <>
      <header className="hero">
        <div className="page-head">
          <p className="brand">
            <LogoMark />
            {t("appName")}
          </p>
          <div className="toolbar landing-toolbar">
            <span className="select-group">
              <label className="select-label" htmlFor="landing-lang">
                {t("language")}
              </label>
              <select
                id="landing-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value === "hi" ? "hi" : "en")}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </span>
            <ThemeSelect
              labels={{
                theme: t("theme"),
                system: t("themeSystem"),
                light: t("themeLight"),
                dark: t("themeDark"),
              }}
            />
          </div>
        </div>
        <h1>{t("heroTitle")}</h1>
        <p className="lead">{t("heroLead")}</p>
      </header>
      {created ? (
        <Credentials created={created} onContinue={goHome} t={t} />
      ) : (
        <div className="grid-2">
          <LoginForm onSuccess={goHome} t={t} />
          <CreateProfileForm onCreated={setCreated} t={t} lang={lang} />
        </div>
      )}
      <section aria-labelledby="features-title" className="features">
        <h2 id="features-title">{t("featuresTitle")}</h2>
        <ul className="feature-list">
          {FEATURES.map(([title, text]) => (
            <li key={title}>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="footer">
        <p>{t("landingFooter")}</p>
      </footer>
    </>
  );
}
