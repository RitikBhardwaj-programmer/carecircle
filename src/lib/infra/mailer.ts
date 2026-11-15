import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "./config";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Short tag for logs, e.g. "dose-missed"; never the address or content. */
  tag: string;
}

export interface Mailer {
  readonly mode: "smtp" | "dry-run";
  send(message: EmailMessage): Promise<void>;
}

/** Logs that an email would be sent, without the address or body. Used when SMTP is not configured. */
export class DryRunMailer implements Mailer {
  readonly mode = "dry-run" as const;
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 100) this.sent.shift();
    logger.info("mail.dry_run", { tag: message.tag });
  }
}

/** Gmail SMTP with an app password (TLS on port 465). */
export class SmtpMailer implements Mailer {
  readonly mode = "smtp" as const;
  private readonly transport: Transporter;
  constructor(
    user: string,
    pass: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    logger.info("mail.sent", { tag: message.tag });
  }
}

export function createMailer(env: Env = process.env): Mailer {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  if (!user || !pass) return new DryRunMailer();
  return new SmtpMailer(user, pass, env.MAIL_FROM?.trim() || `CareCircle <${user}>`);
}
