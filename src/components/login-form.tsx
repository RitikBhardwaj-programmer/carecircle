"use client";

import { useState } from "react";
import { api, ApiError } from "./api";
import { Field, FormError } from "./field";

/** Profile code + passcode login. The server gives one message for every failure. */
export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/login", { method: "POST", body: { code, passcode } });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="login-title" className="card">
      <h2 id="login-title">Open a care profile</h2>
      <p className="muted">For the elder, family members and caretakers. Use the passcode the elder gave you.</p>
      <Field
        label="Profile code"
        name="code"
        autoComplete="username"
        placeholder="CARE-XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={fields.code}
        required
        maxLength={14}
      />
      <Field
        label="Your passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        hint="8 letters or digits"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        error={fields.passcode}
        required
        maxLength={8}
      />
      <FormError message={error} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Opening…" : "Open profile"}
      </button>
    </form>
  );
}
