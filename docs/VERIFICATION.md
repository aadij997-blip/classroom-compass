# Verification record

Build date: 2026-11-24. Environment: macOS, Node 26.3.1, Next.js 16.4.6; local mode first, then a Supabase staging project. Nothing was deployed and no real student data was used.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` (Vitest, 3 files) | **39 / 39 pass** |
| `npm run build` (production) | Pass |
| `npm run check:bundle` | 24 client files scanned for 28 key/content markers: **none found** |

What the tests cover:

- **Fixture assertions** (`tests/analytics.test.ts`): liquidity exit 24 enrolled / 21 complete / 12 expected / 9 target pattern / 3 missing; matched n = 18, before 6 → exit 12 among matched; 12/21 for all respondents (not 12/18); 3 unmatched. Recommendation is the cash-today activity, backed by 9 learners and 18 response IDs. The diversification mixed response is “mixed”, the pending explanation stays pending (not 0), and “not sure” stays uncertain.
- **Interpretation:** blank ≠ incorrect; a calculation slip is tagged as calculation; confidence never changes outcomes; a different item version doesn't count; there's no “0%” without evidence and no recommendation without completed responses.
- **Observation scope:** group and class observations never attach to learners; the grid shows nothing learner-level for an observation-only concept.
- **Access** (`tests/store.test.ts`, SQLite backend):
  - Teacher B cannot read, list, delete, open, paper-enter, issue cards for, or add observations to Teacher A's class.
  - Cross-class learner IDs are rejected.
  - Tokens are stored only as 64-hex hashes.
  - Closed and draft checks reject submissions.
  - Cross-class submission is rejected.
  - Revoked and rotated links stop working, and existing sessions end.
  - Learner context contains no keys, roster, or peer data.
  - Invalid options and items are rejected.
- **Idempotency:** a retry with the same submission ID returns `duplicate`; resending identical content saves nothing; one learner is counted once; revisions keep the history.
- **Paper:** source is recorded; blank vs not entered is kept distinct; closure is enforced.
- **Deletion:** class deletion empties learners, responses, check runs, sessions, learner sessions, and receipts, and turns off links.
- **Content** (`tests/content.test.ts`): 3 modules × (2 anchors + 2 rechecks + activity), 12 items; pilot status present; every non-expected reason is mapped; student projections contain no key, mapping, rationale, or stable option IDs; letters and IDs round-trip; paper letters match digital order; “I am not sure” always last; the expected-answer position covers all 4 slots with no slot above 40% (480 run/item samples).

## Browser verification (built-in browser, local dev server)

Teacher (1440 px), sample class:

1. Landing → **Explore a sample class** → Today. It leads with “Cash today, assets later: 9 of 21 completed checks suggest students may be treating invested money as immediately available. 3 students have not completed the check.”
2. Teach overview: next step, quick class picture (12 / 9, 21 of 24, “Missing is not incorrect”, 20 device + 1 paper), item previews, teacher script, and a matched comparison (18; 6 of 18 → 12 of 18; 12 of 21 for all exit respondents; 3 exit-only).
3. **See the responses behind this suggestion** shows 9 learners and 18 responses, the answer/reason pair table, “may suggest” labels, and the teacher-only guide in a drawer. Context (class, session, back link) is preserved.
4. **Try this together**: the planned action for Learners 13–21 → **Mark taught** (persists) → **Check again with fresh questions** creates a recheck run and goes to Collect → **Open the check**.
5. **Learner cards**: 24 cards with QR codes.

Learners (390 px phone viewport, separate learner sessions):

6. Learner 01 opens a private link → welcome → Q1 saved (“Saved” shown after server confirmation) → Q2 → review → **Send** → confirmation with no correctness shown. Reopening the link shows “Your answers are in” (persistence).
7. Learner 02 (expected-pattern distractors on both items) and Learner 03 (Q1 only, so incomplete).
8. An independent `curl` session (own cookie jar) for Learner 02: the HTML/RSC payload contains only “Learner 02”, letter option IDs A–D, and no `expected_*`, `teacher_only`, mapping tags, rationale, or other aliases. An invalid token redirects to “That link isn't working”. A learner cookie cannot open teacher pages.

Teacher again:

9. Collect showed live counts: 2 complete / 1 started / 21 not started.
10. **Paper entry**: keyboard entry for Learner 04 (`C B - -`) and Learner 05 (`A A D A`). Rows auto-advance and save on leaving; “Saved” appears per row; values persist after reload.
11. **Close the check and see their thinking**: the fresh follow-up shows 3 complete (2 reasoning shown, 1 worth another look), 21 not completed (2 started), 3 device + 2 paper. It is presented as fresh evidence, not compared with the anchors.
12. **Observation-only session**: setup → whole-class observation (tally 10 of 24, “not linked to individual learners”) → Teach shows no individual results.
13. **Explanation review**: the fixture's pending explanation was scored 2/2 and shows “Reviewed: 2/2”.
14. **Learner × concept grid**, **class report** (aggregate only, limitations section), **student handouts** (24 per-alias pages, no key text) and **teacher guide** (keys, letters match).
15. **Print layout**: the report was checked by applying its `@media print` rules on screen (navigation, banners, and footer hidden). It was not printed to a physical printer or PDF.

Local trial mode (real accounts on localhost, test credentials in the gitignored `.data/test-accounts.txt`):

16. Teacher A sign-up → first-use empty state (no sample data mixed in) → create class → 24 cards.
17. Sign out → Teacher B sign-up → Teacher A's class page and report return **404**, and B's class list is empty.

Layout: no horizontal page overflow at 390 px on Today, Set up, Teach, See their thinking, and an activity page. Tablet (768 px) Teach was also checked. The paper grid, the responses table, and the learner grid use labelled scroll regions.

Server logs: no errors. Browser console: only the two expected 404s from step 17.

## Defects found and fixed during verification

- **Answer-key inference.** Student radio values exposed stable option IDs, and in the source content the expected option is always `a`/`r1`. Student payloads now carry only displayed letters, mapped back on the server, and a test enforces this.
- **Paper grid.** Assistive or programmatic text input didn't register because it relied on keydown. Input now goes through `onChange`, and a synchronous ref prevents a lost last keystroke when a row saves on blur.
- **Grid.** It now uses each learner's most recent *answered* check, so a new follow-up with few responses doesn't hide earlier evidence.
- Minor: plural agreement (“1 … suggests”), local date default for observations, “next in sequence” label, scroll-to-top between learner questions, illustration label overflow.

## Supabase verification (staging project, 2026-11-24)

The migrations were applied with `supabase/setup-all.sql` in the SQL Editor (Data API on, auto-grant off, auto-RLS on). Two issues found and fixed first:

- On Supabase, `pgcrypto` lives in the `extensions` schema, so calls are now qualified as `extensions.digest` / `extensions.gen_random_bytes`.
- Projects with auto-grant off need explicit table grants, so the migration now grants exactly what the app needs.

**Anonymous (public key only):** every app table is blocked (`42501`); a fake card token gets no session; a fake session gets no context and submissions are rejected; `owns_class` is not callable.

**Through the app (browser):**
- Teacher A signs up with Supabase Auth and sees the first-use page, then creates a 6-learner class with 6 cards.
- Starting a liquidity session creates the check run. Opening the check works.
- Learners 01–03 answered through private links. Learner 01 shows expected reasoning, Learner 02 the target pattern, and Learner 03 answered Q1 only.
- Teacher paper entry for Learner 05 (`B C - -`) saved through row-level security.
- Closing the check shows the Teach page computed from Supabase data: 3 of 6 complete (1 reasoning shown, 1 worth another look, 1 mixed), 2 started, “2 of 3 completed checks suggest students may be treating invested money as immediately available”, 4 device + 1 paper.
- Selected-learners audience pre-filled with exactly Learners 02 and 04 → **Use this plan** → **Mark taught** → **Check again with fresh questions** creates a recheck run.
- Turning off Learner 06's card works.

**Learner functions, called directly:**
- A first submission saves 2; a retry with the same ID returns `duplicate: true`; the same content under a new ID saves 0.
- An invalid option is rejected (`unknown answer`), and an unknown check is rejected (`not available`).
- Changing an answer saves 1 and writes a revision.
- The learner context contains only that learner's alias, with no keys, mappings, or peers.
- After closing, the learner sees 0 open checks, and a submission is rejected (`check closed`).
- The revoked card gets no session.

**Teacher B attacking Teacher A's data directly with B's own JWT (bypassing the app):**
- Reads of classes, learners, sessions, check runs, responses, revisions, teaching actions, and observations all return **0 rows**.
- Reading `token_hash` is blocked. Adding a learner or a session to A's class is blocked.
- Reopening A's check, deleting A's class, and reassigning A's class to B each changed **0 rows**.
- Forging a device response is blocked by the trigger, and `owns_class(A)` returns false.
- In the app, B gets 404 on A's class and evidence pages and sees an empty class list.

**Teacher A, directly:** reads their own class, responses (9), revisions (1), and teaching actions (1). `token_hash` is blocked even for the owner. Deleting a throwaway class cascaded learners, sessions, and observations to 0.

Test accounts `teacher-a@example.test` and `teacher-b@example.test` exist in the staging project (password in the gitignored `.data/test-accounts.txt`). Delete them under **Authentication → Users** when no longer needed.

## Not verified

- Supabase email confirmation and password reset emails. The test project has “Confirm email” off.
- Two different physical devices on a network. Learners were driven from the same machine with separate learner sessions.
- Real printer or PDF output, and screen-reader passes (VoiceOver/NVDA). Structure was checked: semantic landmarks, labelled controls, table captions and scope, icon + text for states, and visible focus.
- Rate limits under real classroom load. The limiter is in-process, so it won't share state across multiple serverless instances.
- The ~2-minute setup target and ~90-second interpretation target are design hypotheses for the teacher pilot. They weren't measured.
- Public deployment (not performed).

## Acceptance checklist mapping

See `05-ACCEPTANCE-CHECKLIST.txt` in the handoff. Every item in Product/Visual, Functional loop, Content/Analytics, and Usability was exercised above or in tests, except where listed under “Not verified”. Access/Data items are verified for both the SQLite and Supabase backends.
