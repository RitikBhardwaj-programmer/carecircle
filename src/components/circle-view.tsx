"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProfileSettings } from "@/lib/domain/types";
import { api, ApiError } from "./api";
import { Field, FormError } from "./field";
import { Icon } from "./icon";
import { useSession } from "./session-context";

interface PublicMember {
  id: string;
  name: string;
  email: string | null;
  role: "elder" | "family" | "caretaker";
  permission: "view" | "manage";
  notify: boolean;
  revokedAt: string | null;
}

function NewPasscode({ name, passcode, code, onClose }: { name: string; passcode: string; code: string; onClose: () => void }) {
  return (
    <section className="card credentials" aria-labelledby="newpass-title">
      <h2 id="newpass-title">Share these with {name}</h2>
      <p>The passcode is shown only once. Give it to {name} in person or by phone.</p>
      <dl className="cred-list">
        <dt>Profile code</dt>
        <dd>
          <code>{code}</code>
        </dd>
        <dt>Passcode for {name}</dt>
        <dd>
          <code>{passcode}</code>
        </dd>
      </dl>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    </section>
  );
}

/** Inline editor for a member's email; an empty value removes the address. */
function EmailEditor({ member, onSaved }: { member: PublicMember; onSaved: () => void }) {
  const { announce } = useSession();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(member.email ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/members/${member.id}`, { method: "PATCH", body: { email: value.trim() || null } });
      announce(`Email for ${member.name} saved`);
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.email ?? err.message) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        {member.email ? "Change email" : "Add email"}
        <span className="sr-only"> for {member.name}</span>
      </button>
    );
  }
  return (
    <form onSubmit={save} noValidate className="inline-form" aria-label={`Email for ${member.name}`}>
      <Field label={`Email for ${member.name}`} type="email" value={value} onChange={(e) => setValue(e.target.value)} error={error} maxLength={254} />
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save email
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ initial, onSaved }: { initial: ProfileSettings; onSaved: () => void }) {
  const { announce } = useSession();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof ProfileSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings", { method: "PUT", body: s });
      announce("Reminder settings saved");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save} aria-labelledby="settings-title">
      <h2 id="settings-title">Reminders and escalation (elder decides)</h2>
      <Field label="Upcoming dose email, minutes before" type="number" min={5} max={120} value={s.upcomingLeadMin} onChange={num("upcomingLeadMin")} />
      <Field label="Missed dose email to me, minutes after" type="number" min={10} max={180} value={s.missedGraceMin} onChange={num("missedGraceMin")} />
      <label className="check">
        <input type="checkbox" checked={s.escalateToCircle} onChange={(e) => setS({ ...s, escalateToCircle: e.target.checked })} /> Tell my care circle if I
        miss a dose
      </label>
      <Field
        label="Tell the circle after, minutes"
        type="number"
        min={15}
        max={180}
        value={s.escalateAfterMin}
        onChange={num("escalateAfterMin")}
        disabled={!s.escalateToCircle}
      />
      <FormError message={error} />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function CircleView() {
  const { profile, member: me, can, t, announce } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<PublicMember[] | null>(null);
  const [shown, setShown] = useState<{ name: string; passcode: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "family" as "family" | "caretaker", permission: "view" as "view" | "manage", notify: true });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers((await api<{ members: PublicMember[] }>("/api/members")).members);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Initial data fetch for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api<{ member: PublicMember; passcode: string }>("/api/members", {
        method: "POST",
        body: { ...form, email: form.email || null },
      });
      setShown({ name: res.member.name, passcode: res.passcode });
      setForm({ ...form, name: "", email: "" });
      announce(`${res.member.name} added`);
      await load();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  async function act(m: PublicMember, action: "revoke" | "reset" | "toggle-permission" | "toggle-notify") {
    setError(null);
    try {
      if (action === "revoke") {
        if (!window.confirm(`Revoke access for ${m.name}? They are logged out at once.`)) return;
        await api(`/api/members/${m.id}`, { method: "DELETE" });
        announce(`${m.name} no longer has access`);
      } else if (action === "reset") {
        if (!window.confirm(`Create a new passcode for ${m.name}? The old one stops working and ${m.name} is logged out on other devices.`)) return;
        const res = await api<{ passcode: string }>(`/api/members/${m.id}/passcode`, { method: "POST" });
        setShown({ name: m.name, passcode: res.passcode });
      } else if (action === "toggle-permission") {
        await api(`/api/members/${m.id}`, { method: "PATCH", body: { permission: m.permission === "view" ? "manage" : "view" } });
        announce(`${m.name} permission changed`);
      } else {
        await api(`/api/members/${m.id}`, { method: "PATCH", body: { notify: !m.notify } });
        announce(`${m.name} email alerts ${m.notify ? "off" : "on"}`);
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const active = members?.filter((m) => !m.revokedAt) ?? [];
  const revoked = members?.filter((m) => m.revokedAt) ?? [];

  return (
    <section aria-labelledby="circle-title">
      <div className="page-head">
        <h1 id="circle-title">{t("navCircle")}</h1>
        <Link href="/activity" className="btn btn-ghost">
          <Icon name="activity" />
          {t("seeActivity")}
        </Link>
      </div>
      <p className="muted">
        {profile.elderName} decides who is in the circle, what they can do, and when they are told about missed doses.
      </p>
      {!can.manageCircle ? <p className="notice">Only {profile.elderName} can add or remove members and change reminder settings.</p> : null}
      {shown ? <NewPasscode name={shown.name} passcode={shown.passcode} code={profile.code} onClose={() => setShown(null)} /> : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}

      {members === null ? (
        <p aria-busy="true">{t("loading")}</p>
      ) : (
        <table className="table table-stack">
          <caption>Members with access</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Access</th>
              <th scope="col">Email alerts</th>
              {can.manageCircle ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {active.map((m) => (
              <tr key={m.id}>
                <th scope="row">
                  {m.name} {m.id === me.id ? <span className="badge">You</span> : null}
                </th>
                <td data-label="Role">{m.role}</td>
                <td data-label="Access">{m.role === "elder" ? "full (owner)" : m.permission === "manage" ? "view and manage" : "view only"}</td>
                <td data-label="Email alerts">{m.email ? (m.notify ? "on" : "off") : "no email"}</td>
                {can.manageCircle ? (
                  <td data-label="Actions">
                    {m.role !== "elder" ? (
                      <div className="row wrap">
                        <EmailEditor member={m} onSaved={() => void load()} />
                        <button type="button" className="btn btn-ghost" onClick={() => void act(m, "toggle-permission")}>
                          {m.permission === "view" ? "Allow manage" : "Make view only"}
                          <span className="sr-only"> for {m.name}</span>
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void act(m, "toggle-notify")}>
                          Alerts {m.notify ? "off" : "on"}
                          <span className="sr-only"> for {m.name}</span>
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void act(m, "reset")}>
                          New passcode<span className="sr-only"> for {m.name}</span>
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => void act(m, "revoke")}>
                          Revoke<span className="sr-only"> {m.name}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="row wrap">
                        <EmailEditor
                          member={m}
                          onSaved={() => {
                            void load();
                            router.refresh();
                          }}
                        />
                        <button type="button" className="btn btn-ghost" onClick={() => void act(m, "reset")}>
                          New passcode<span className="sr-only"> for {m.name}</span>
                        </button>
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {revoked.length > 0 ? (
        <p className="muted">Revoked: {revoked.map((m) => m.name).join(", ")}</p>
      ) : null}

      {can.manageCircle ? (
        <>
          <form className="card" onSubmit={add} noValidate aria-labelledby="add-member-title">
            <h2 id="add-member-title">Add a family member or caretaker</h2>
            <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} required maxLength={80} />
            <Field
              label="Email (optional, for alerts)"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={fields.email}
              maxLength={254}
            />
            <div className="row wrap">
              <div className="field">
                <label htmlFor="member-role">Role</label>
                <select id="member-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value === "caretaker" ? "caretaker" : "family" })}>
                  <option value="family">Family</option>
                  <option value="caretaker">Caretaker</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-permission">Access</label>
                <select
                  id="member-permission"
                  value={form.permission}
                  onChange={(e) => setForm({ ...form, permission: e.target.value === "manage" ? "manage" : "view" })}
                >
                  <option value="view">View only</option>
                  <option value="manage">View and manage medicines</option>
                </select>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> Send email alerts
            </label>
            <FormError message={error && Object.keys(fields).length ? error : null} />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Adding…" : "Add and create passcode"}
            </button>
          </form>
          <SettingsForm initial={profile.settings} onSaved={() => router.refresh()} />
        </>
      ) : null}
    </section>
  );
}
