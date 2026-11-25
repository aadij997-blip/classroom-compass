# Interpretation rules

Implemented in `src/lib/analytics/index.ts` (pure functions, unit-tested in `tests/analytics.test.ts`). The sample class and real classes use the same code.

## 1. Item level (one answer + one reason)

| Answer | Reason | Outcome | Teacher label |
| --- | --- | --- | --- |
| missing | — or missing | `incomplete` | Not enough to read |
| expected | expected | `expected` | Expected answer and reason |
| any | mapped to `uncertain` (“I am not sure”) | `uncertain` | Chose “not sure” |
| unexpected | expected | `mixed` | Mixed — needs a look |
| expected | other mapped reason | `partial` | Expected answer, different reason |
| unexpected | other mapped reason | `difficulty` | Possible difficulty |

- A wrong answer alone never produces a named misconception. Tags come only from the **reason** chosen.
- `arithmetic-check` tags are reported as a **calculation** pattern, never as a concept difficulty.
- “I am not sure” stays uncertain and never becomes a misconception.
- Confidence is stored and shown separately. It never changes an outcome.
- Optional explanations are **pending** until a teacher reviews them on the 0/1/2 rubric. Pending is not zero. Reviews are stored separately from raw responses.
- Only responses to the **exact item version** in a check run count for that run.

## 2. Learner level, for one check run

A learner is **complete** when every item in the run has both an answer and a reason. A stored row with no answer (for example, a paper sheet handed in blank) counts as a response with not enough evidence. It is not “not started” and not “incorrect”.

| Rule (evaluated in order) | Summary | Label |
| --- | --- | --- |
| No stored response | `not_started` | No response yet |
| Some response, not complete | `incomplete` | Not enough evidence |
| Every item `expected` | `reasoning_shown` | Reasoning shown on this check |
| Every item `uncertain` | `unsure` | Unsure on this check |
| Every item `difficulty` or `partial` with a tag | `worth_another_look` | Worth another look |
| Anything else (contradictory/mixed) | `mixed` | Mixed evidence |

Contradictory evidence is kept, not averaged. There is no “mastered” label, and no label describes a learner beyond the check it came from.

## 3. Check level

- **Eligible** = learners on the class roster. All learner counts are **unique learners**, never response rows.
- Complete, incomplete, and not-started counts are always shown. Missing is never counted as incorrect.
- With no eligible evidence, the UI says “No evidence yet” and never shows “0%”.
- Sources (device vs paper) and confidence are reported separately.

## 4. Suggestions

1. Only learners with a **complete** check contribute.
2. For each reason tag, count the unique learners with that tag on at least one item. Each candidate carries the exact learner IDs and response IDs behind it.
3. Concept tags map to the module's activity (`suggestion_rules` in the content). Calculation tags suggest checking the numbers with pre-counted tokens. Uncertain tags suggest gathering explanations.
4. If some learners showed the expected reasoning, a **stretch (extension)** candidate is added after any teaching candidates.
5. Candidates are ranked by count, with ties broken by kind and then key. There are no thresholds: the count and denominator are shown and the teacher decides. With fewer than 8 completed checks, the overview says the picture is tentative. This is a display note, not a validated cutoff.
6. With zero completed checks there is no suggestion, but the teaching activity is still available.
7. The teacher chooses the audience (whole class, a table group, or selected learners). Selected learners are pre-filled only with learners whose completed check showed the pattern. Unassessed learners are never grouped automatically.
8. “Mark taught” records a teaching action. It is never treated as evidence of learning.

## 5. Before/exit comparison

- Only between a **before** run and a later **exit** run in the same class and concept, with **identical item IDs and versions**. Otherwise the UI explains why no comparison is shown.
- **Matched** = learners complete in both. Reported: matched n; reasoning shown before vs exit *within the matched group*; reasoning shown among **all** exit respondents (a separate population and denominator); exit-only, before-only, and missing-both counts.
- Fixture check: matched n = 18, before 6/18 → exit 12/18, all exit respondents 12/21 (not 12/18).
- Fresh follow-up (recheck) items are **new evidence** and are never compared numerically with anchor items.
- No causal or lasting-behavior claims appear in the UI or the report.

## 6. Observations

- Scope is explicit: individual, group, or class.
- Only **individual** observations attach to a learner's timeline as their own evidence. Group observations appear on member timelines labelled “for context only, not an individual result”. Class tallies (with denominator) never identify learners.
- Observations never change answers or the item and learner outcomes above.

## 7. Teacher disagreement

Teachers can add a note to any response (“add context”, “I read this differently”, “I agree”). Notes are stored as `interpretation_note` reviews next to the response. The original answer, revision history, and the deterministic outcome stay unchanged and visible.

## 8. Edits and closure

- Learners may change answers while a check is **open**. Each change stores the previous revision.
- Teachers may enter or change paper responses while a check is draft or open. A **closed** check rejects all writes. The teacher can reopen it explicitly.
- Retried submissions with the same submission ID return the original result and change nothing.
