# CareCircle — Design and Build Spec

Elderly Care & Medication Management Platform (Catalyst 2026).
Source of truth for requirements: `../PROBLEM_STATEMENT.md`. This file defines the *how*.

## 1. Product idea in one paragraph

CareCircle is a shared care space for one elderly person. The elder owns the profile.
Family members and caretakers join with their own passcode, which the elder grants and can revoke.
Authorized members view, add, edit and manage medication schedules, track adherence and monitor
doctor appointments. The system sends proactive emails for upcoming doses, missed doses and
appointments. It goes beyond a reminder app in four ways: the elder controls access and escalation,
an Elder Mode makes the daily task one large button, an email link marks a dose as taken without
login, and Gemini turns a prescription photo into a draft schedule that a human must confirm.

## 2. Requirement → feature map (acceptance criteria)

| # | Problem statement requirement | Feature | Done when |
|---|---|---|---|
| R1 | Secure, passcode-based access to the elder's profile | Profile code + per-member passcode, scrypt hash, lockout, signed session cookie | Wrong passcode is refused; 5 failures lock the profile for 15 min; revoked member loses access on the next request |
| R2 | Shared ecosystem: elder, caretakers, family | Roles `elder`, `family`, `caretaker`; permission `view` or `manage` | Elder adds a member and gets a one-time passcode to share; `view` members cannot write |
| R3 | View, add, edit, manage medication schedules | Medication CRUD with times, days, start/end date, instructions | All four operations work in the UI and API, with validation |
| R4 | Track adherence | Dose log (taken / skipped), today view, 7-day and 30-day adherence per medication | Marking a dose updates the dashboard; missed doses show after the grace period |
| R5 | Monitor upcoming doctor appointments | Appointment CRUD, upcoming list, "Add to Google Calendar" link | Appointments sort by date; past ones move to history |
| R6 | Proactive email: upcoming doses | Cron planner sends an email 15 min before a dose | Exactly one email per dose per recipient |
| R7 | Proactive email: missed medications | Email to elder at +30 min; escalation to circle at +60 min if the elder allows it | No email if the dose was logged; no duplicate emails |
| R8 | Proactive email: appointments | Email 24 h and 2 h before | Exactly one email per window per recipient |
| R9 | Elder at the centre of decisions | Only the elder manages members and escalation settings; activity log shows who changed what | A `family` member cannot add members or change escalation |
| R10 | Smarter | Gemini: prescription photo → draft schedule (confirm before save); plain-language medicine explainer in English and Hindi | Draft is never saved without a human pressing Confirm; every AI text shows "not medical advice" |
| R11 | More accessible | Elder Mode: large text, high contrast, one "Taken" button per dose, read-aloud, Hindi UI strings | Keyboard-only use works; axe tests pass on key screens |
| R12 | Reliable | Idempotent notifications, deterministic dose IDs, email dry-run fallback, health endpoint | Running the cron twice sends nothing new |

## 3. Stack

- Next.js (App Router) + TypeScript `strict`, Node 22 runtime, deployed to **Cloud Run** (asia-south1) with a Dockerfile and `output: "standalone"`.
- **Firestore** (Native mode, asia-south1) through `@google-cloud/firestore` with Application Default Credentials (no key file).
- **Gemini** through `@google/genai`. Primary: Vertex AI with Application Default Credentials (no API key). Fallback: `GEMINI_API_KEY` if set. Check the current model id in the official docs before coding; do not guess it.
- **Cloud Scheduler** → `POST /api/cron/reminders` every 5 min with an OIDC token.
- **Secret Manager** for `SESSION_SECRET`, `SMTP_USER`, `SMTP_PASS`.
- **Cloud Build + Artifact Registry** (used by `gcloud run deploy --source`), **Cloud Logging** (structured JSON logs).
- Nodemailer + Gmail SMTP. If SMTP variables are absent, the mailer logs the email (dry-run) so the app still works.
- Runtime dependencies kept small: `next`, `react`, `react-dom`, `zod`, `@google-cloud/firestore`, `@google/genai`, `google-auth-library`, `nodemailer`. Hashing, HMAC and time-zone maths use Node built-ins.
- Dev: Vitest, Testing Library, an axe matcher for Vitest, ESLint (`next/core-web-vitals` + `jsx-a11y`), Prettier.

## 4. Architecture

```
Browser (React, Elder Mode / Circle Mode)
   │  fetch, httpOnly session cookie
   ▼
Next.js on Cloud Run
   app/api/*  thin route handlers: parse (zod) → authorize → call service → map errors
   src/lib/domain/*    pure functions (no I/O): schedule, adherence, reminder planner
   src/lib/services/*  use cases: auth, members, medications, doses, appointments, reminders, ai
   src/lib/repo/*      Repository interface + FirestoreRepo + MemoryRepo (tests, local)
   src/lib/infra/*     mailer, gemini client, logger, rate limiter, config
   │                         │                    │
   ▼                         ▼                    ▼
Firestore               Gemini (Vertex AI)     Gmail SMTP
   ▲
Cloud Scheduler ──OIDC──► POST /api/cron/reminders
```

Rule: `domain/` never imports `repo/` or `infra/`. Services receive their dependencies as arguments
(dependency injection: the caller passes the repo, mailer and clock in), so tests use `MemoryRepo`,
a fake mailer and a fixed clock.

## 5. Data model (Firestore)

```
profiles/{profileId}
  code            "CARE-7K2M-9QXD"  (public login id, unique)
  elderName, timezone (IANA, default "Asia/Kolkata"), language ("en" | "hi")
  settings: { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: true, escalateAfterMin: 60 }
  failedLogins, lockedUntil, createdAt
  members/{memberId}        name, email?, role, permission, passcodeHash, salt, revokedAt?, notify: bool
  medications/{medId}       name, dosage, instructions?, times ["08:00"], days [0..6] (empty = daily),
                            startDate, endDate?, active, updatedBy, updatedAt
  doseLogs/{medId_YYYY-MM-DD_HHmm}   status "taken" | "skipped", byMemberId, via "app" | "email", at
  appointments/{apptId}     doctor, purpose, location?, at (UTC instant), notes?, updatedBy
  notifications/{key}       type, recipient, sentAt        (key = sha256 of type|dose-or-appt|recipient)
  activity/{id}             actorName, action, target, at  (append-only)
```

Doses are not stored. `dosesForDay(medication, localDate)` computes them. A dose has the
deterministic id `medId_date_time`, so logging twice is an idempotent write (same result when repeated).

## 6. Security design

- **Passcodes:** generated by the server, 8 characters from an alphabet without look-alikes (no 0/O/1/I), shown once. Stored as `scrypt` hash with a per-member random salt. Compared with `timingSafeEqual`.
- **Login:** profile code + passcode. Check the lock first, then compare against each active member. On failure, increment `failedLogins` in a transaction; 5 failures set `lockedUntil = now + 15 min`. The error message is the same for "unknown profile" and "wrong passcode".
- **Session:** `base64url(payload).HMAC-SHA256` with `SESSION_SECRET`; payload = profileId, memberId, exp (12 h). Cookie flags: `HttpOnly; Secure; SameSite=Strict; Path=/`. Every request reloads the member, so a revoke works at once.
- **Authorization:** one function `authorize(session, action)` with a permission table: `view` → read; `manage` → read + write medications, doses, appointments; `elder` → all of that + members + settings. Every route handler calls it.
- **CSRF:** `SameSite=Strict` plus an `Origin` header check on every non-GET route.
- **One-tap email link:** token = HMAC over `profileId|doseId|exp` (24 h). The GET page only shows a confirm button; the POST writes the log. Mail scanners that pre-open links therefore cannot mark a dose.
- **Cron endpoint:** verify the OIDC token with `google-auth-library` (audience = service URL, email = the scheduler service account). Reject anything else with 401.
- **Input:** zod schema for every body, query and route parameter; length limits on all strings; image upload ≤ 4 MB and JPEG/PNG/WebP only; the image is not stored.
- **Output:** React escapes UI text; email templates escape HTML explicitly.
- **Headers:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`.
- **Rate limit:** in-memory token bucket per IP on login and AI routes (per instance; the Firestore lock is the durable control). State this honestly in the README.
- **Secrets:** only in Secret Manager and a git-ignored `.env`. A dedicated Cloud Run service account holds only `datastore.user`, `aiplatform.user`, `secretmanager.secretAccessor`.
- **Logs:** no passcodes, tokens, emails or medical text in logs.

## 7. Reminder engine

`planReminders(now, profileSnapshot, alreadySentKeys) → Reminder[]` is a pure function.

| Type | Condition | Recipients |
|---|---|---|
| `dose-upcoming` | dose time is within the next `upcomingLeadMin` | elder (if email) |
| `dose-missed` | dose time + `missedGraceMin` passed, no log, same local day | elder |
| `dose-escalation` | dose time + `escalateAfterMin` passed, no log, `escalateToCircle` true | members with `notify` |
| `appt-24h`, `appt-2h` | appointment starts within the window | elder + members with `notify` |

Flow per run: load profiles → build snapshot → plan → for each reminder, `create()` the
`notifications/{key}` document first (fails if it exists) → send → on send failure delete the key so
the next run retries. Look-back window is 3 hours, so a late cron run still sends a missed-dose alert
but never an old one. Local time comes from `Intl.DateTimeFormat` with the profile time zone.
Test cases to include: midnight boundary, a dose logged between two runs, an end-dated medication,
a non-daily medication, a revoked member, two runs at the same minute.

## 8. Gemini features

1. **Prescription scan:** photo → Gemini with a JSON response schema → `MedicationDraft[]` → validated with zod → shown in an editable form → saved only after Confirm. 20 s timeout. Any failure shows "enter it by hand" with the normal form.
2. **Explainer:** medicine name + dosage → 3 short sections (what it is for, how to take it, questions for your doctor) in English or Hindi. Fixed system instruction: no diagnosis, no dose changes, always end with the "not medical advice, ask your doctor or pharmacist" line. Cache the result per (name, language) in memory.

Stretch only if time remains: weekly plain-language adherence summary for the circle.

## 9. UI and accessibility

Pages: `/` (create or open a profile), `/home` (Elder Mode or Circle dashboard, by role and toggle),
`/medications`, `/appointments`, `/circle` (members, elder only for writes), `/activity`,
`/dose/[token]` (one-tap confirm).

- Semantic landmarks, one `h1` per page, skip link, visible focus ring, `aria-live="polite"` status region for "Marked as taken".
- Every input has a `<label>`; errors link with `aria-describedby`; no colour-only meaning (icon + text for taken / missed).
- Text contrast ≥ 7:1 in both modes and control borders ≥ 3:1 (checked by `tests/contrast.test.ts`). Touch targets ≥ 48 px, 60 px in Elder Mode. Base font 19 px, 22 px in Elder Mode (class on `<html>`). Labelled bottom tab bar on phones, visible toast with Undo, "Ask CareCircle" assistant (see README).
- `prefers-reduced-motion` respected. `lang` attribute follows the chosen language.
- Read-aloud button uses the browser Speech Synthesis API.
- Plain CSS with custom properties; no UI library; no image assets except inline SVG.

## 10. Testing plan (target ≥ 80 tests, ≥ 80 % line coverage on `src/lib`)

| Area | Kind |
|---|---|
| schedule, adherence, reminder planner, time-zone helpers | unit, table-driven |
| passcode hash, session token, dose-link token, authorize table | unit, including tamper and expiry cases |
| zod schemas | unit, valid and invalid inputs |
| services with `MemoryRepo` + fake mailer + fixed clock | integration |
| route handlers (login, lockout, medication CRUD, cron auth) | integration |
| key components (dose card, login form, medication form) | Testing Library + axe |
| rate limiter, email templates (HTML escaping) | unit |

CI: `.github/workflows/ci.yml` runs lint, type check, tests with coverage.

## 11. Build order (IST, 15 Nov 2026)

| Time | Stage | Exit check |
|---|---|---|
| 10:15–11:00 | Repo, scaffold, Dockerfile, CI, enable APIs, Firestore DB, service account, `SESSION_SECRET`; deploy skeleton | Live Cloud Run URL returns the home page and `/api/health` |
| 11:00–12:30 | `domain/`, `repo/`, auth + members, medications, doses, appointments — with tests | Tests green; API works with curl |
| 12:30–13:45 | UI: all pages, Elder Mode, Hindi strings | Manual walk-through on the deployed URL |
| 13:45–14:30 | Reminder planner, cron route, Scheduler job, mailer, one-tap link | Cron run sends once; second run sends nothing |
| 14:30–15:10 | Gemini scan + explainer | Works on the deployed URL; failure path shown |
| 15:10–15:30 | Security headers, a11y pass, README with criteria → evidence table, mock-judge review, deploy | Submission #1 at 15:30 |
| 15:30–16:30 | Fix the weakest scored area only; redeploy; verify URL in a private window | Final submission before 17:00 |

Cut order if late: weekly summary → Hindi UI strings (keep Hindi explainer) → `/activity` page (keep the log writes) → prescription scan (keep explainer). Never cut: R1–R9, tests, README, working Cloud Run URL.

## 12. Assumptions and open points

- Vertex AI Gemini works on the free-trial project. If it does not, set `GEMINI_API_KEY`.
- Gmail app password is supplied by the owner in `.env` and Secret Manager. Until then the mailer runs in dry-run.
- The person who creates the profile is the elder (or sets it up with the elder) and holds the elder passcode.
- Repo size limit is unknown; keep the repo well under 1 MB (no `node_modules`, `.next`, images or lockfile bloat beyond `package-lock.json`).
