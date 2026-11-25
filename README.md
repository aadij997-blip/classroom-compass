# InvestQuest Classroom Compass

**See what your students are learning — and know what to teach next.**

A teacher companion for MoneyMind Games' physical InvestQuest card game (grades 4–6). It connects one short loop:

> Choose a goal → play → two-question reflection check → see the thinking → teach → check again.

The first screen after a check shows **one suggested teaching move**, the concept, and the supporting count (for example *“9 of 21 completed checks suggest students may be treating invested money as immediately available. 3 students have not completed the check.”*). Every suggestion links to the exact responses behind it.

> Questions and activities are **original pilot material requiring educator review** before use with real students. Short checks describe what learners showed on that check — not lasting ability or financial behavior.

---

## What's in the MVP

| Area | What it does |
| --- | --- |
| **Today** | One primary action: resume collecting, open the latest next step, or start a session. |
| **Classes** | Create a class (title, grade band, learner count) → numbered aliases (`Learner 01`…) and printable private QR cards. Optional table groups. Card rotation/revocation. Class deletion removes everything. |
| **Session: Set up → Collect → Teach** | Pick concept (opportunity cost · diversification · liquidity), mode (digital · paper · observation only), and before/exit check. Preview student view + teacher-only answer guide. Open/close collection explicitly; live complete / started / not-started counts; optional observations. |
| **Digital check** | Learner opens a private card link → minimal 390px flow, two answer-and-reason questions, optional confidence and explanation, save-as-you-go, retry-safe submit, confirmation without revealing answers. |
| **Paper** | Printable student copies (per alias or blank) with identical item versions and letter order; separate teacher guide; fast keyboard entry grid (letters, `-` for left blank, empty for no sheet). |
| **Observation only** | Individual / group / class scope with optional tally + denominator, supports used, note, date. Never turned into learner-level results. |
| **Teach overview** | 1) A good next step · 2) What we noticed (distribution, coverage, sources, confidence kept separate) · 3) See their thinking (items, every response, reviews, notes). Matched before/exit comparison when versions are identical. |
| **Teaching ideas** | Read / teach / print each activity. With session context: why it's suggested (with evidence link), audience (whole class / table group / selected learners), accept or dismiss, mark taught, **Check again** with fresh questions or the same questions. |
| **Class views** | Learner × concept grid (icon + text, keyboard-accessible table), teacher-only learner timeline, printable aggregate class report with limitations. |
| **Sample class** | “Explore a sample class” seeds an isolated, clearly labelled fictional class from `content/demo-fixture.json`; resettable; uses the same analytics as real classes. |

Out of scope by design: digital game simulation, rankings, AI grading, learning-style labels, LMS/billing/parents, live market data, automatic sharing.

---

## Run it locally (no credentials needed)

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`; developed on Node 26).

```bash
npm install
npm run dev            # http://localhost:3000
```

Then choose **Explore a sample class**, or **Create account** for a local trial workspace.

Without Supabase credentials the app runs in **local mode**:

- **Sample class** — in-memory and per-browser. It resets on “Reset” or a server restart.
- **Local trial accounts and classes** — stored in `.data/compass.sqlite` on this computer (gitignored).

Local mode is for evaluation only. **It is not set up for classroom collection across devices** (the banner says so in the app). Use Supabase for real classes.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build / server |
| `npm test` | Vitest: analytics, fixture assertions, content projection, store access boundaries, idempotency |
| `npm run typecheck` | TypeScript |
| `npm run check:bundle` | After a build: fails if answer keys, mappings, rationale, or raw content appear in any client bundle |
| `node scripts/generate-content-seed.mjs` | Regenerates the Supabase `content_items` seed after content changes |

---

## Configured classroom mode (Supabase)

1. Create a Supabase project. In **Authentication → Providers**, enable Email.
2. Apply the migrations in order (SQL editor, or `supabase db push` with the Supabase CLI):
   - `supabase/migrations/20261124000001_classroom_compass.sql` — tables, constraints, triggers, row-level security, learner RPCs
   - `supabase/migrations/20261124000002_content_items.sql` — option IDs per item version (no keys)
3. Copy `.env.example` to `.env.local` and set:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   **No service-role key is used.** Don't add one.
4. Use `npm run build && npm start`, served over HTTPS (secure cookies are on in production).

With Supabase configured, teacher sign-up and sign-in use Supabase Auth, and all teacher data goes through RLS. The sample class still runs in memory and is never mixed with real data.

> ⚠️ The Supabase backend (`src/lib/store/supabase.ts` and the migrations) was written to the same interface as the SQLite backend, but **was not run against a live Supabase project during the build** (no credentials were available). See `docs/VERIFICATION.md`. Exercise it on a staging project before any classroom use.

---

## Architecture

```
content/                      versioned learning content (pilot-1.1) + demo fixture
src/lib/content/              server-only content access, student projection, deterministic option order
src/lib/analytics/            pure, tested interpretation functions (shared by sample + real classes)
src/lib/store/                TeacherStore / LearnerStore interface
  sqlite.ts                   node:sqlite backend (sample class + local trial)
  supabase.ts                 Supabase backend (RLS + SECURITY DEFINER learner RPCs)
src/lib/server/               mode resolution, auth, view models, rate limiting
src/app/(teacher)/            Today, Classes, Teaching ideas, session steps, reports
src/app/s/[token]             private-link exchange → short-lived learner session
src/app/check/                minimal learner flow
supabase/migrations/          Postgres schema, constraints, triggers, RLS, RPCs
```

### Security and privacy model

- **Teachers** see only their own classes. Every store method checks ownership on the server. In Supabase mode, RLS (`classes.teacher_id = auth.uid()`) also applies to every table. IDs sent from the client are never treated as authorization.
- **Learners** use unguessable private card tokens (192 bits), **stored only as SHA-256 hashes**. A token is exchanged for a 3-hour learner session, also hashed. Rotating or revoking a card ends its sessions. There is no roster picker, class code, email, or name.
- Learners can read only the currently open check's questions and their own answers, and submit only to open checks in their own class. Closure, assignment, item version, and option validity are enforced on the server (and by DB triggers in Postgres).
- **Answer keys and interpretation mappings never leave the server.** Student payloads identify options only by displayed letter (A–D); the server maps letters back to stable option IDs. `npm run check:bundle` scans built client JS.
- **Idempotency:** each submission carries a client-generated ID (stored as a receipt), responses are unique per (check, learner, item), and unchanged re-submissions don't bump revisions. Every change keeps the previous revision.
- Rate limits are per network address, sized for a whole class on one school IP (240 link opens and 900 submissions per minute), and tighter per learner session.
- No third-party analytics. Error logs never include learner text or tokens.
- Deleting a class cascades to its learners, sessions, responses, revisions, observations, reviews, teaching actions, receipts, and learner sessions.
- This product **does not claim** to be legally compliant or school-approved.

---

## Docs

- `docs/INTERPRETATION-RULES.md` — how answers, reasons, and observations become labels and suggestions
- `docs/VERIFICATION.md` — what was run, results, and what still needs a configured environment
- `docs/CONTENT-REVIEW.md` — content changes and notes for educator review
- `docs/PROVENANCE.md` — brand assets, fonts, and license

Fonts: Outfit 400/600/700, self-hosted under the SIL Open Font License (`public/fonts/Outfit-OFL.txt`).
