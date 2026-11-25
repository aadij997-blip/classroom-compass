# Content changes and educator-review notes

Source: `content/learning-content.json`, originally `pilot-1` from the handoff, now **`pilot-1.1`**. All 12 items, 3 modules, and 3 activities are **original draft pilot material and need educator review before use with real students**. They aren't validated instruments.

## Changes made

| Item | Version | Change | Reason |
| --- | --- | --- | --- |
| `oc-recheck-02` | v1 → **v2** | Scenario: “It prefers the book set … It buys the books” → “The class prefers the book set … The class buys the books.” Options, keys, and mappings are unchanged. | The ambiguous pronoun “It” could read as the art kit. The version was bumped because student-facing wording changed, so v1 and v2 responses are never compared as identical. |

All item IDs are preserved, and no other student-facing text was changed. A `change_log` entry is recorded in the JSON.

## Authored additions (outside the JSON, also need review)

- `src/lib/content/interpretations.ts`:
  - teacher-facing wording for every reason tag (“…suggest students may be *treating invested money as immediately available*”)
  - observation categories
  - supports list
  - one **“Listen for / Try asking”** prompt per concept for use during physical play
- Activity “fresh follow-up questions” use each module's two `recheck_item_ids`.

## Notes for the reviewer

1. **Expected option is always `a` / `r1` in the source.** Display order is shuffled per check run (stable seed), and student devices see only letters, so neither position nor markup gives the key away. Consider varying the source order too.
2. `div-anchor-01` maps reason r3 (“All sectors are always affected in exactly the same way”) to `ignores-shared-sector-exposure`. The tag reads more like “assumes identical exposure”, so check the name against your intent. The teacher wording shown is “Assuming every sector is affected in exactly the same way”.
3. `liq-anchor-02` and `liq-recheck-01` include numeric distractors tagged `arithmetic-check`. They are surfaced as calculation slips, not liquidity difficulties, as the suggestion rules intend.
4. Item `context` values (“game-related simplified …” vs “transfer”) are kept but not shown to learners.
5. Confidence options are shown to learners as “Sure / Somewhat sure / Unsure”.
6. Activities run 6–7 minutes, as supplied. The diversification activity tells teachers not to award invented returns, and the app doesn't simulate the game.
