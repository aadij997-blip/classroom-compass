import { describe, expect, it } from "vitest";
import { fixtureBundle, FIXTURE_ASSERTIONS as A } from "@/lib/demo/fixture";
import { classifyItem, compareRuns, recommend, share, summarizeCheck, summarizeLearner, observationsFor, learnerConceptGrid } from "@/lib/analytics";
import { getItem } from "@/lib/content";
import type { ResponseRecord } from "@/lib/domain/types";

const lookup = (id: string, v: number) => getItem(id, v);
const bundle = fixtureBundle();
const run = (id: string) => bundle.checkRuns.find((r) => r.id === id)!;

describe("fixture: liquidity exit check", () => {
  const s = summarizeCheck(run("liq-exit"), bundle.learners, bundle.responses, lookup);

  it("counts unique eligible learners, completion and missing", () => {
    expect(s.eligible).toBe(A.liquidity_exit_enrolled);
    expect(s.complete).toBe(A.liquidity_exit_complete);
    expect(s.notStarted).toBe(A.liquidity_exit_no_completed_check);
    expect(s.incomplete).toBe(0);
  });

  it("separates expected reasoning from the target pattern", () => {
    expect(s.distribution.reasoning_shown).toBe(A.liquidity_exit_expected_answer_and_reason_on_both_items);
    expect(s.distribution.worth_another_look).toBe(A.liquidity_exit_target_reason_on_both_items);
  });

  it("recommends the cash-today activity with exact evidence", () => {
    const recs = recommend(s, "activity-cash-today");
    expect(recs[0].key).toBe("assets-are-immediately-available-cash");
    expect(recs[0].count).toBe(9);
    expect(recs[0].denominator).toBe(21);
    expect(recs[0].responseIds).toHaveLength(18); // two items × nine learners
    expect(new Set(recs[0].learnerIds).size).toBe(9);
    expect(recs.at(-1)!.kind).toBe("extend");
  });

  it("does not count paper entries twice or count responses as learners", () => {
    expect(s.sources.paper_entered_by_teacher).toBe(1);
    expect(s.learners.filter((l) => l.complete)).toHaveLength(21);
  });
});

describe("fixture: matched before/exit comparison", () => {
  const c = compareRuns(run("liq-before"), run("liq-exit"), bundle.learners, bundle.responses, lookup);
  it("matches learners on identical item versions", () => {
    expect(c.comparable).toBe(true);
    if (!c.comparable) return;
    expect(c.matched).toBe(A.liquidity_matched_before_exit);
    expect(c.beforeShownInMatched).toBe(A.liquidity_matched_before_expected_both);
    expect(c.afterShownInMatched).toBe(A.liquidity_matched_exit_expected_both);
    expect(c.afterOnly).toBe(A.liquidity_exit_unmatched_respondents);
  });
  it("keeps the all-respondent denominator separate (12/21, not 12/18)", () => {
    if (!c.comparable) throw new Error();
    expect(c.afterShownAllRespondents).toBe(12);
    expect(c.afterRespondents).toBe(21);
  });
  it("refuses to compare different item versions", () => {
    const fresh = { ...run("liq-exit"), id: "x", phase: "recheck" as const, items: [{ itemId: "liq-recheck-01", version: 1 }, { itemId: "liq-recheck-02", version: 1 }] };
    expect(compareRuns(run("liq-before"), fresh, bundle.learners, bundle.responses, lookup).comparable).toBe(false);
    const bumped = { ...run("liq-exit"), id: "y", items: [{ itemId: "liq-anchor-01", version: 2 }, { itemId: "liq-anchor-02", version: 1 }] };
    expect(compareRuns(run("liq-before"), bumped, bundle.learners, bundle.responses, lookup).comparable).toBe(false);
  });
});

describe("fixture: diversification mixed evidence and pending review", () => {
  const s = summarizeCheck(run("div-exit"), bundle.learners, bundle.responses, lookup, bundle.reviews);
  it("marks the mixed response as mixed, not incorrect", () => {
    const l = s.learners.find((x) => x.items.some((i) => i.response?.id === A.diversification_mixed_response_id))!;
    const item = l.items.find((i) => i.response?.id === A.diversification_mixed_response_id)!;
    expect(item.outcome).toBe("mixed");
  });
  it("keeps an unreviewed explanation pending, not zero", () => {
    const l = s.learners.find((x) => x.items.some((i) => i.response?.id === A.pending_optional_explanation_response_id))!;
    const item = l.items.find((i) => i.response?.id === A.pending_optional_explanation_response_id)!;
    expect(item.explanation).toBe("pending");
    expect(item.explanationScore).toBeNull();
    expect(s.explanations.pending).toBe(1);
  });
  it("treats 'I am not sure' as uncertain, never as a misconception", () => {
    const unsure = s.learners.filter((l) => l.items.every((i) => i.outcome === "uncertain"));
    expect(unsure.length).toBeGreaterThan(0);
    for (const l of unsure) expect(l.summary).toBe("unsure");
  });
});

describe("observations keep their scope", () => {
  it("group and class observations never attach to a learner", () => {
    const views = observationsFor(bundle);
    expect(views.every((v) => v.attachesToLearner === null)).toBe(true);
    expect(observationsFor(bundle, { learnerId: "learner-01" })).toHaveLength(0);
  });
  it("grid shows no learner-level result for an observation-only concept", () => {
    const grid = learnerConceptGrid(bundle, lookup, ["opportunity-cost"]);
    expect(grid.every((row) => row.cells[0].summary === null)).toBe(true);
  });
});

describe("item classification", () => {
  const item = getItem("liq-anchor-02", 1)!;
  const base: ResponseRecord = {
    id: "r", classId: "c", learnerId: "l", checkRunId: "k", itemId: item.id, itemVersion: 1,
    answerId: "a", reasonId: "r1", confidence: null, explanation: null, source: "student_device",
    revision: 1, submittedAt: "", updatedAt: "",
  };
  it("blank is incomplete, not incorrect", () => {
    expect(classifyItem(item, null).outcome).toBe("incomplete");
    expect(classifyItem(item, { ...base, reasonId: null }).outcome).toBe("incomplete");
  });
  it("calculation slip is tagged as calculation, not a liquidity misconception", () => {
    const c = classifyItem(item, { ...base, answerId: "c", reasonId: "r3" });
    expect(c.tag).toBe("arithmetic-check");
    expect(c.tagKind).toBe("calculation");
  });
  it("expected answer with an unexpected reason is partial evidence", () => {
    expect(classifyItem(item, { ...base, reasonId: "r2" }).outcome).toBe("partial");
  });
  it("confidence never changes the outcome", () => {
    const a = classifyItem(item, { ...base, confidence: "sure" });
    const b = classifyItem(item, { ...base, confidence: "unsure" });
    expect(a).toEqual(b);
  });
  it("responses to a different item version do not count for a run", () => {
    const r = run("liq-exit");
    const wrongVersion = bundle.responses.filter((x) => x.checkRunId === "liq-exit" && x.learnerId === "learner-01").map((x) => ({ ...x, itemVersion: 9 }));
    expect(summarizeLearner(r, "learner-01", wrongVersion, lookup).summary).toBe("not_started");
  });
});

describe("honest shares", () => {
  it("never shows 0% for absent evidence", () => {
    expect(share(0, 0)).toBe("No evidence yet");
    expect(share(0, 5)).toBe("0 of 5");
  });
  it("no recommendation without completed responses", () => {
    const empty = summarizeCheck(run("liq-exit"), bundle.learners, [], lookup);
    expect(recommend(empty, "activity-cash-today")).toEqual([]);
  });
});
