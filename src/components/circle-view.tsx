"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProfileSettings } from "@/lib/domain/types";
import { api, ApiError } from "./api";
import { Field, FormError } from "./field";
import { Skeleton } from "./feedback";
import { Icon } from "./icon";
import { fill } from "@/lib/i18n";
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

function NewPasscode({
  name,
  passcode,
  code,
  onClose,
}: {
  name: string;
  passcode: string;
  code: string;
  onClose: () => void;
}) {
  const { t } = useSession();
  return (
    <section className="card credentials" aria-labelledby="newpass-title">
      <h2 id="newpass-title">{fill(t("shareWith"), { name })}</h2>
      <p>{fill(t("shownOnce"), { name })}</p>
      <dl className="cred-list">
        <dt>{t("profileCode")}</dt>
        <dd>
          <code>{code}</code>
        </dd>
        <dt>{fill(t("passcodeFor"), { name })}</dt>
        <dd>
          <code>{passcode}</code>
        </dd>
      </dl>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        {t("done")}
      </button>
    </section>
  );
}

/** Inline editor for a member's email; an empty value removes the address. */
function EmailEditor({ member, onSaved }: { member: PublicMember; onSaved: () => void }) {
  const { announce, t } = useSession();
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
      announce(fill(t("emailSaved"), { name: member.name }));
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
        {member.email ? t("changeEmail") : t("addEmail")}
        <span className="sr-only">{fill(t("forName"), { name: member.name })}</span>
      </button>
    );
  }
  return (
    <form
      onSubmit={save}
      noValidate
      className="inline-form"
      aria-label={fill(t("emailFor"), { name: member.name })}
    >
      <Field
        label={fill(t("emailFor"), { name: member.name })}
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error}
        maxLength={254}
      />
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t("saveEmail")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ initial, onSaved }: { initial: ProfileSettings; onSaved: () => void }) {
  const { announce, t } = useSession();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof ProfileSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS({ ...s, [k]: Number(e.target.value) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings", { method: "PUT", body: s });
      announce(t("settingsSaved"));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save} aria-labelledby="settings-title">
      <h2 id="settings-title">{t("settingsTitle")}</h2>
      <Field
        label={t("upcomingLead")}
        type="number"
        min={5}
        max={120}
        value={s.upcomingLeadMin}
        onChange={num("upcomingLeadMin")}
      />
      <Field
        label={t("missedGrace")}
        type="number"
        min={10}
        max={180}
        value={s.missedGraceMin}
        onChange={num("missedGraceMin")}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={s.escalateToCircle}
          onChange={(e) => setS({ ...s, escalateToCircle: e.target.checked })}
        />{" "}
        {t("escalate")}
      </label>
      <Field
        label={t("escalateAfter")}
        type="number"
        min={15}
        max={180}
        value={s.escalateAfterMin}
        onChange={num("escalateAfterMin")}
        disabled={!s.escalateToCircle}
      />
      <FormError message={error} />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t("saving") : t("saveSettings")}
      </button>
    </form>
  );
}

export function CircleView() {
  const { profile, member: me, can, t, announce } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<PublicMember[] | null>(null);
  const [shown, setShown] = useState<{ name: string; passcode: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "family" as "family" | "caretaker",
    permission: "view" as "view" | "manage",
    notify: true,
  });
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
      announce(fill(t("memberAdded"), { name: res.member.name }));
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
        if (!window.confirm(fill(t("confirmRevoke"), { name: m.name }))) return;
        await api(`/api/members/${m.id}`, { method: "DELETE" });
        announce(fill(t("memberRevoked"), { name: m.name }));
      } else if (action === "reset") {
        if (!window.confirm(fill(t("confirmNewPass"), { name: m.name }))) return;
        const res = await api<{ passcode: string }>(`/api/members/${m.id}/passcode`, { method: "POST" });
        setShown({ name: m.name, passcode: res.passcode });
      } else if (action === "toggle-permission") {
        await api(`/api/members/${m.id}`, {
          method: "PATCH",
          body: { permission: m.permission === "view" ? "manage" : "view" },
        });
        announce(fill(t("memberPermChanged"), { name: m.name }));
      } else {
        await api(`/api/members/${m.id}`, { method: "PATCH", body: { notify: !m.notify } });
        announce(fill(t(m.notify ? "memberAlertsOff" : "memberAlertsOn"), { name: m.name }));
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
      <p className="muted">{fill(t("circleIntro"), { name: profile.elderName })}</p>
      {!can.manageCircle ? (
        <p className="notice">{fill(t("onlyElderNotice"), { name: profile.elderName })}</p>
      ) : null}
      {shown ? (
        <NewPasscode
          name={shown.name}
          passcode={shown.passcode}
          code={profile.code}
          onClose={() => setShown(null)}
        />
      ) : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}

      {members === null ? (
        <Skeleton label={t("loading")} />
      ) : (
        <table className="table table-stack">
          <caption>{t("membersCaption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("colName")}</th>
              <th scope="col">{t("colRole")}</th>
              <th scope="col">{t("colAccess")}</th>
              <th scope="col">{t("colAlerts")}</th>
              {can.manageCircle ? <th scope="col">{t("colActions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {active.map((m) => (
              <tr key={m.id}>
                <th scope="row">
                  {m.name} {m.id === me.id ? <span className="badge">{t("you")}</span> : null}
                </th>
                <td data-label={t("colRole")}>{t(`role_${m.role}`)}</td>
                <td data-label={t("colAccess")}>
                  {m.role === "elder"
                    ? t("accessFull")
                    : m.permission === "manage"
                      ? t("accessManage")
                      : t("accessView")}
                </td>
                <td data-label={t("colAlerts")}>
                  {m.email ? (m.notify ? t("alertsOn") : t("alertsOff")) : t("noEmailShort")}
                </td>
                {can.manageCircle ? (
                  <td data-label={t("colActions")}>
                    {m.role !== "elder" ? (
                      <div className="row wrap">
                        <EmailEditor member={m} onSaved={() => void load()} />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void act(m, "toggle-permission")}
                        >
                          {m.permission === "view" ? t("allowManage") : t("makeViewOnly")}
                          <span className="sr-only">{fill(t("forName"), { name: m.name })}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void act(m, "toggle-notify")}
                        >
                          {m.notify ? t("alertsTurnOff") : t("alertsTurnOn")}
                          <span className="sr-only">{fill(t("forName"), { name: m.name })}</span>
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void act(m, "reset")}>
                          {t("newPasscode")}
                          <span className="sr-only">{fill(t("forName"), { name: m.name })}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void act(m, "revoke")}
                        >
                          {t("revoke")}
                          <span className="sr-only"> {m.name}</span>
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
                          {t("newPasscode")}
                          <span className="sr-only">{fill(t("forName"), { name: m.name })}</span>
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
        <p className="muted">{fill(t("revokedList"), { names: revoked.map((m) => m.name).join(", ") })}</p>
      ) : null}

      {can.manageCircle ? (
        <>
          <form className="card" onSubmit={add} noValidate aria-labelledby="add-member-title">
            <h2 id="add-member-title">{t("addMemberTitle")}</h2>
            <Field
              label={t("colName")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={fields.name}
              required
              maxLength={80}
            />
            <Field
              label={t("emailOptAlerts")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={fields.email}
              maxLength={254}
            />
            <div className="row wrap">
              <div className="field">
                <label htmlFor="member-role">{t("colRole")}</label>
                <select
                  id="member-role"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value === "caretaker" ? "caretaker" : "family" })
                  }
                >
                  <option value="family">{t("optFamily")}</option>
                  <option value="caretaker">{t("optCaretaker")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-permission">{t("colAccess")}</label>
                <select
                  id="member-permission"
                  value={form.permission}
                  onChange={(e) =>
                    setForm({ ...form, permission: e.target.value === "manage" ? "manage" : "view" })
                  }
                >
                  <option value="view">{t("optViewOnly")}</option>
                  <option value="manage">{t("optManage")}</option>
                </select>
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.notify}
                onChange={(e) => setForm({ ...form, notify: e.target.checked })}
              />{" "}
              {t("sendAlerts")}
            </label>
            <FormError message={error && Object.keys(fields).length ? error : null} />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("adding") : t("addAndCreate")}
            </button>
          </form>
          <SettingsForm initial={profile.settings} onSaved={() => router.refresh()} />
        </>
      ) : null}
    </section>
  );
}
