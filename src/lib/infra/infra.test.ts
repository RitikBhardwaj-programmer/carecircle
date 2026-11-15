import { escapeHtml, renderReminder } from "../email/templates";
import type { Reminder } from "../domain/reminders";
import { getConfig } from "./config";
import { createMailer, DryRunMailer, SmtpMailer } from "./mailer";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows the capacity then blocks, then refills over time", () => {
    const rl = new RateLimiter(3, 60);
    const t = 1_000_000;
    expect([rl.take("ip", t), rl.take("ip", t), rl.take("ip", t), rl.take("ip", t)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(rl.take("other", t)).toBe(true);
    expect(rl.take("ip", t + 1_000)).toBe(true);
  });

  it("evicts old keys when full", () => {
    const rl = new RateLimiter(1, 1, 2);
    rl.take("a", 0);
    rl.take("b", 0);
    rl.take("c", 0);
    expect(rl.take("a", 0)).toBe(true);
  });
});

describe("email templates", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  });

  const base: Omit<Reminder, "type"> = {
    key: "k",
    profileId: "p1",
    recipient: { memberId: "m1", name: "<b>Ravi</b>", email: "r@example.com" },
    dose: {
      id: "med-1_2026-11-15_0800",
      medicationId: "med-1",
      date: "2026-11-15",
      time: "08:00",
      at: "2026-11-15T02:30:00.000Z",
      medicationName: "Metformin<img src=x>",
      dosage: "500 mg",
    },
  };
  const ctx = { elderName: "Asha", timeZone: "Asia/Kolkata", appUrl: "https://care.example" };

  it.each(["dose-upcoming", "dose-missed", "dose-escalation"] as const)("renders %s safely", (type) => {
    const msg = renderReminder({ ...base, type }, { ...ctx, doseLink: "https://care.example/dose/t" });
    expect(msg.to).toBe("r@example.com");
    expect(msg.html).not.toContain("<img src=x>");
    expect(msg.html).not.toContain("<b>Ravi</b>");
    expect(msg.html).toContain("Mark as taken");
    expect(msg.text).toContain("https://care.example/dose/t");
    expect(msg.tag).toBe(type);
  });

  it("renders appointment reminders", () => {
    const msg = renderReminder(
      {
        key: "k",
        profileId: "p1",
        type: "appt-2h",
        recipient: base.recipient,
        appointment: {
          id: "a1",
          profileId: "p1",
          doctor: "Dr. Rao",
          purpose: "Eye check",
          location: "City Clinic",
          at: "2026-11-16T05:00:00.000Z",
          notes: null,
          updatedBy: "x",
          updatedAt: "x",
        },
      },
      ctx,
    );
    expect(msg.subject).toBe("Appointment in about 2 hours: Dr. Rao");
    expect(msg.text).toContain("City Clinic");
  });

  it("throws on a reminder without a target", () => {
    expect(() => renderReminder({ ...base, dose: undefined, type: "dose-missed" }, ctx)).toThrow();
  });
});

describe("mailer factory", () => {
  it("uses dry-run without SMTP credentials", async () => {
    const m = createMailer({});
    expect(m).toBeInstanceOf(DryRunMailer);
    await m.send({ to: "a@b.c", subject: "s", text: "t", html: "h", tag: "test" });
    expect((m as DryRunMailer).sent).toHaveLength(1);
  });

  it("uses SMTP when credentials are present", () => {
    expect(createMailer({ SMTP_USER: "u@gmail.com", SMTP_PASS: "p" })).toBeInstanceOf(SmtpMailer);
  });
});

describe("config", () => {
  it("rejects a short session secret", () => {
    expect(() => getConfig({ SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("never accepts the cron dev key on Cloud Run", () => {
    const secret = "s".repeat(40);
    expect(getConfig({ SESSION_SECRET: secret, CRON_DEV_KEY: "k" }).cronDevKey).toBe("k");
    expect(getConfig({ SESSION_SECRET: secret, CRON_DEV_KEY: "k", K_SERVICE: "carecircle" }).cronDevKey).toBeUndefined();
  });

  it("defaults to firestore and strips the trailing slash", () => {
    const c = getConfig({ SESSION_SECRET: "s".repeat(40), APP_URL: "https://x.run.app/" });
    expect(c.dataStore).toBe("firestore");
    expect(c.appUrl).toBe("https://x.run.app");
  });
});
