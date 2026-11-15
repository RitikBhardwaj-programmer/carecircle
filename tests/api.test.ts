import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as cron } from "@/app/api/cron/reminders/route";
import { POST as doseLink } from "@/app/api/dose-link/route";
import { GET as getDoses, POST as postDose } from "@/app/api/doses/route";
import { GET as getMe } from "@/app/api/me/route";
import { DELETE as revoke } from "@/app/api/members/[id]/route";
import { GET as listMembers, POST as addMember } from "@/app/api/members/route";
import { DELETE as delMed, PUT as putMed } from "@/app/api/medications/[id]/route";
import { GET as listMeds, POST as createMed } from "@/app/api/medications/route";
import { POST as createProfile } from "@/app/api/profiles/route";
import { GET as listAppts, POST as createAppt } from "@/app/api/appointments/route";
import { GET as activity } from "@/app/api/activity/route";
import { PUT as putSettings } from "@/app/api/settings/route";
import { setIdTokenVerifierForTesting } from "@/lib/infra/oidc";
import { setDepsForTesting } from "@/lib/server/container";
import { makeDeps, medInput } from "./helpers";

const ORIGIN = "http://localhost:3005";

function req(method: string, path: string, opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: "localhost:3005", ...opts.headers };
  if (method !== "GET" && !("origin" in headers)) headers.origin = ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function cookieOf(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  return set.split(";")[0] ?? "";
}

let env: ReturnType<typeof makeDeps>;

async function newProfile(email: string | null = "elder@example.com") {
  const res = await createProfile(req("POST", "/api/profiles", { body: { elderName: "Asha Devi", email } }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { code: body.profile.code as string, passcode: body.passcode as string, cookie: cookieOf(res) };
}

beforeEach(() => {
  env = makeDeps("2026-11-15T04:30:00.000Z");
  setDepsForTesting(env.deps);
  // Each test gets a fresh limiter IP so rate limits do not leak between tests.
  ipCounter += 1;
});
afterEach(() => {
  setDepsForTesting(null);
  setIdTokenVerifierForTesting(null);
});
let ipCounter = 0;

describe("profile creation and login", () => {
  it("creates a profile, sets a secure session cookie and never returns hashes", async () => {
    const res = await createProfile(req("POST", "/api/profiles", { body: { elderName: "Asha" } }));
    const body = await res.json();
    expect(body.profile.code).toMatch(/^CARE-/);
    expect(body.passcode).toMatch(/^[A-Z2-9]{8}$/);
    expect(JSON.stringify(body)).not.toMatch(/passcodeHash|salt|failedLogins/);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("rejects invalid input with field errors", async () => {
    const res = await createProfile(req("POST", "/api/profiles", { body: { elderName: "" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toHaveProperty("elderName");
  });

  it("rejects non-JSON bodies", async () => {
    const r = new NextRequest(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { host: "localhost:3005", origin: ORIGIN },
      body: "{not json",
    });
    expect((await login(r)).status).toBe(400);
  });

  it("logs in, then refuses a wrong passcode and locks after 5 failures", async () => {
    const p = await newProfile();
    const ok = await login(req("POST", "/api/auth/login", { body: { code: p.code, passcode: p.passcode }, headers: { "x-forwarded-for": `10.0.0.${ipCounter}` } }));
    expect(ok.status).toBe(200);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await login(req("POST", "/api/auth/login", { body: { code: p.code, passcode: "WRONGPWD" }, headers: { "x-forwarded-for": `10.0.1.${ipCounter}` } }));
      statuses.push(r.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 423]);
  });

  it("rate limits login attempts per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const r = await login(req("POST", "/api/auth/login", { body: { code: "CARE-ZZZZ-ZZZZ", passcode: "ABCDEFGH" }, headers: { "x-forwarded-for": "203.0.113.9" } }));
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
  });

  it("blocks cross-site writes (Origin check)", async () => {
    const res = await createProfile(
      req("POST", "/api/profiles", { body: { elderName: "Asha" }, headers: { origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(403);
    const noOrigin = new NextRequest(`${ORIGIN}/api/profiles`, {
      method: "POST",
      headers: { host: "localhost:3005" },
      body: JSON.stringify({ elderName: "Asha" }),
    });
    expect((await createProfile(noOrigin)).status).toBe(403);
  });

  it("requires a session for private routes and logout clears it", async () => {
    expect((await getMe(req("GET", "/api/me"))).status).toBe(401);
    const p = await newProfile();
    const me = await getMe(req("GET", "/api/me", { cookie: p.cookie }));
    expect(await me.json()).toMatchObject({ member: { role: "elder" }, can: { write: true, manageCircle: true } });
    const out = await logout(req("POST", "/api/auth/logout", { cookie: p.cookie }));
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });
});

describe("circle, medications, doses and appointments over HTTP", () => {
  it("full flow: add member, CRUD medication, mark dose, appointment, revoke", async () => {
    const p = await newProfile();
    const added = await addMember(
      req("POST", "/api/members", { cookie: p.cookie, body: { name: "Ravi", role: "family", permission: "view", email: "ravi@example.com" } }),
    );
    expect(added.status).toBe(201);
    const { member, passcode } = await added.json();

    const ravi = await login(req("POST", "/api/auth/login", { body: { code: p.code, passcode }, headers: { "x-forwarded-for": `10.1.0.${ipCounter}` } }));
    const raviCookie = cookieOf(ravi);

    // view member can read but not write
    expect((await createMed(req("POST", "/api/medications", { cookie: raviCookie, body: medInput }))).status).toBe(403);
    expect((await addMember(req("POST", "/api/members", { cookie: raviCookie, body: { name: "X", role: "family", permission: "manage" } }))).status).toBe(403);

    const created = await createMed(req("POST", "/api/medications", { cookie: p.cookie, body: medInput }));
    expect(created.status).toBe(201);
    const { medication } = await created.json();
    expect((await (await listMeds(req("GET", "/api/medications", { cookie: raviCookie }))).json()).medications).toHaveLength(1);

    const edited = await putMed(req("PUT", `/api/medications/${medication.id}`, { cookie: p.cookie, body: { ...medInput, dosage: "250 mg" } }), ctx(medication.id));
    expect((await edited.json()).medication.dosage).toBe("250 mg");
    expect((await putMed(req("PUT", "/api/medications/bad id", { cookie: p.cookie, body: medInput }), ctx("bad id"))).status).toBe(400);

    const doseId = `${medication.id}_2026-11-15_0800`;
    expect((await postDose(req("POST", "/api/doses", { cookie: p.cookie, body: { doseId, status: "taken" } }))).status).toBe(200);
    const today = await (await getDoses(req("GET", "/api/doses", { cookie: raviCookie }))).json();
    expect(today.doses[0]).toMatchObject({ id: doseId, state: "taken" });
    expect(today.adherence[0].week.taken).toBe(1);

    const appt = await createAppt(
      req("POST", "/api/appointments", { cookie: p.cookie, body: { doctor: "Dr. Rao", purpose: "Eye check", at: "2026-11-20T10:30:00+05:30" } }),
    );
    expect(appt.status).toBe(201);
    const appts = await (await listAppts(req("GET", "/api/appointments", { cookie: raviCookie }))).json();
    expect(appts.upcoming[0].calendarUrl).toContain("calendar.google.com");

    expect((await putSettings(req("PUT", "/api/settings", { cookie: raviCookie, body: { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: false, escalateAfterMin: 60 } }))).status).toBe(403);

    expect((await revoke(req("DELETE", `/api/members/${member.id}`, { cookie: p.cookie }), ctx(member.id))).status).toBe(200);
    expect((await listMembers(req("GET", "/api/members", { cookie: raviCookie }))).status).toBe(401);

    expect((await delMed(req("DELETE", `/api/medications/${medication.id}`, { cookie: p.cookie }), ctx(medication.id))).status).toBe(200);
    const log = await (await activity(req("GET", "/api/activity", { cookie: p.cookie }))).json();
    expect(log.activity.map((a: { action: string }) => a.action)).toContain("revoked access of");
  });
});

describe("cron route (R12)", () => {
  it("rejects requests without a valid OIDC token", async () => {
    expect((await cron(req("POST", "/api/cron/reminders"))).status).toBe(401);
    setIdTokenVerifierForTesting(async () => ({ email: "attacker@example.com", email_verified: true }));
    process.env.CRON_INVOKER_EMAIL = "sched@example.iam.gserviceaccount.com";
    const bad = await cron(req("POST", "/api/cron/reminders", { headers: { authorization: "Bearer t" } }));
    expect(bad.status).toBe(401);
  });

  it("accepts the scheduler identity, sends once and nothing on the second run", async () => {
    process.env.CRON_INVOKER_EMAIL = "sched@example.iam.gserviceaccount.com";
    let seenAudience = "";
    setIdTokenVerifierForTesting(async (_t, aud) => {
      seenAudience = aud;
      return { email: "sched@example.iam.gserviceaccount.com", email_verified: true };
    });
    const p = await newProfile();
    await createMed(req("POST", "/api/medications", { cookie: p.cookie, body: medInput }));
    env.clock.set("2026-11-15T03:05:00.000Z");
    const headers = { authorization: "Bearer good" };
    const first = await (await cron(req("POST", "/api/cron/reminders", { headers }))).json();
    const second = await (await cron(req("POST", "/api/cron/reminders", { headers }))).json();
    expect(seenAudience).toBe("http://localhost:3005/api/cron/reminders");
    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);

    // The email's one-tap link marks the dose via POST.
    const token = /\/dose\/([A-Za-z0-9_.-]+)/.exec(env.mailer.sent[0]?.text ?? "")?.[1];
    const res = await doseLink(req("POST", "/api/dose-link", { body: { token } }));
    expect(await res.json()).toMatchObject({ status: "taken" });
  });
});
