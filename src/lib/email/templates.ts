import type { Reminder } from "../domain/reminders";
import type { EmailMessage } from "../infra/mailer";

/** Escapes text for safe use inside HTML email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface Context {
  elderName: string;
  timeZone: string;
  appUrl: string;
  /** One-tap "mark as taken" link for dose emails. */
  doseLink?: string;
}

/** Footer: why the person gets the email and how to stop it. */
export function footerText(elderName: string): string {
  return `Sent by CareCircle because you are in ${elderName}'s care circle. To stop these emails, ask ${elderName} to turn off your alerts (or remove your email) on the Care circle page.`;
}

function layout(title: string, lines: string[], footer: string, action?: { href: string; label: string }): string {
  const body = lines.map((l) => `<p style="font-size:18px;line-height:1.5;margin:0 0 12px">${escapeHtml(l)}</p>`);
  const button = action
    ? `<p><a href="${escapeHtml(action.href)}" style="display:inline-block;background:#0b3d91;color:#ffffff;padding:14px 24px;border-radius:8px;font-size:20px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#111827;max-width:560px;margin:auto;padding:16px"><h1 style="font-size:24px">${escapeHtml(title)}</h1>${body.join("")}${button}<p style="font-size:14px;color:#374151">${escapeHtml(footer)}</p></body></html>`;
}

/** Builds the email for one planned reminder. All user-supplied text is escaped. */
export function renderReminder(r: Reminder, ctx: Context): EmailMessage {
  const who = r.recipient.name;
  let subject: string;
  let lines: string[];
  let action: { href: string; label: string } | undefined;

  if (r.dose) {
    const d = r.dose;
    const what = `${d.medicationName} (${d.dosage})`;
    const when = formatLocal(d.at, ctx.timeZone);
    if (r.type === "dose-upcoming") {
      subject = `Reminder: ${d.medicationName} at ${d.time}`;
      lines = [`Hello ${who},`, `It is almost time for ${what} at ${when}.`];
    } else if (r.type === "dose-missed") {
      subject = `Missed dose: ${d.medicationName} at ${d.time}`;
      lines = [`Hello ${who},`, `${what} was due at ${when} and is not marked as taken yet.`];
    } else {
      subject = `${ctx.elderName} may have missed ${d.medicationName}`;
      lines = [
        `Hello ${who},`,
        `${ctx.elderName}'s dose of ${what} was due at ${when} and is not marked yet.`,
        `${ctx.elderName} has chosen to let the care circle know. A gentle call may help.`,
      ];
    }
    if (ctx.doseLink) action = { href: ctx.doseLink, label: "Mark as taken" };
  } else if (r.appointment) {
    const a = r.appointment;
    const when = formatLocal(a.at, ctx.timeZone);
    const soon = r.type === "appt-2h" ? "in about 2 hours" : "tomorrow";
    subject = `Appointment ${soon}: ${a.doctor}`;
    lines = [
      `Hello ${who},`,
      `${ctx.elderName} has an appointment with ${a.doctor} ${soon} (${when}).`,
      `Purpose: ${a.purpose}.`,
      ...(a.location ? [`Where: ${a.location}.`] : []),
    ];
    action = { href: `${ctx.appUrl}/appointments`, label: "Open appointments" };
  } else {
    throw new Error("Reminder has neither dose nor appointment");
  }

  const footer = footerText(ctx.elderName);
  const text = [...lines, ...(action ? [`${action.label}: ${action.href}`] : []), footer].join("\n\n");
  return { to: r.recipient.email, subject, text, html: layout(subject, lines, footer, action), tag: r.type };
}
