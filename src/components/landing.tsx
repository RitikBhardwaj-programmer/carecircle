"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "./api";
import { Field, FormError } from "./field";
import { LoginForm } from "./login-form";

interface Created {
  profile: { code: string; elderName: string };
  passcode: string;
}

function CreateProfileForm({ onCreated }: { onCreated: (c: Created) => void }) {
  const [elderName, setElderName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      const res = await api<Created>("/api/profiles", {
        method: "POST",
        body: { elderName, email: email || null, language, timezone },
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
      <h2 id="create-title">Create a care profile</h2>
      <p className="muted">The elder owns the profile and decides who joins the circle.</p>
      <Field
        label="Elder's name"
        name="elderName"
        autoComplete="name"
        value={elderName}
        onChange={(e) => setElderName(e.target.value)}
        error={fields.elderName}
        required
        maxLength={80}
      />
      <Field
        label="Elder's email (for reminders, optional)"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fields.email}
        maxLength={254}
      />
      <div className="field">
        <label htmlFor="create-language">Language</label>
        <select id="create-language" value={language} onChange={(e) => setLanguage(e.target.value === "hi" ? "hi" : "en")}>
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
        </select>
      </div>
      <FormError message={error} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Creating…" : "Create profile"}
      </button>
    </form>
  );
}

function Credentials({ created, onContinue }: { created: Created; onContinue: () => void }) {
  return (
    <section className="card credentials" aria-labelledby="cred-title">
      <h2 id="cred-title">Save these details now</h2>
      <p>
        This is the only time the passcode is shown. Write it down. {created.profile.elderName} uses it to log in.
      </p>
      <dl className="cred-list">
        <dt>Profile code</dt>
        <dd>
          <code>{created.profile.code}</code>
        </dd>
        <dt>Elder passcode</dt>
        <dd>
          <code>{created.passcode}</code>
        </dd>
      </dl>
      <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
        I have saved them — continue
      </button>
    </section>
  );
}

export function Landing() {
  const router = useRouter();
  const [created, setCreated] = useState<Created | null>(null);
  const goHome = () => {
    router.replace("/home");
    router.refresh();
  };
  if (created) return <Credentials created={created} onContinue={goHome} />;
  return (
    <div className="grid-2">
      <LoginForm onSuccess={goHome} />
      <CreateProfileForm onCreated={setCreated} />
    </div>
  );
}
