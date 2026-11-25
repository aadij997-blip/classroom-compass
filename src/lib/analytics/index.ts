// Pure, deterministic analytics shared by the sample class and real classes.
// Rules are documented in docs/INTERPRETATION-RULES.md; keep the two in sync.
//
// Principles enforced here:
// - Learner-level counts use unique eligible learners, never response rows.
// - Missing and incomplete evidence stays visible and is never "incorrect".
// - Confidence is reported separately and never changes an outcome.
// - Explanations are unscored until a teacher reviews them (pending ≠ 0).
// - Group/class observations never become learner-level results.
// - Before/exit comparisons use matched learners on identical item versions.

import type {
  CheckRun,
  ClassBundle,
  Confidence,
  Learner,
  Observation,
  ResponseRecord,
  TeacherReview,
} from "@/lib/domain/types";
import type { FullItem } from "@/lib/content/schema";
import { tagInfo, type TagKind } from "@/lib/content/interpretations";

export type ItemLookup = (itemId: string, version: number) => FullItem | undefined;

// ---------------------------------------------------------------- item level

export type ItemOutcome =
  | "expected" // expected answer + expected reason
  | "partial" // expected answer + unexpected (non-"unsure") reason
  | "mixed" // unexpected answer + expected reason
  | "difficulty" // unexpected answer + mapped unexpected reason
  | "uncertain" // "I am not sure" reason, any answer
  | "incomplete"; // answer or reason missing

export interface ItemResult {
  itemId: string;
  itemVersion: number;
  response: ResponseRecord | null;
  outcome: ItemOutcome;
  /** Interpretation tag for the chosen reason, if it is mapped. */
  tag: string | null;
  tagKind: TagKind | null;
  explanation: "none" | "pending" | "reviewed";
  explanationScore: 0 | 1 | 2 | null;
}

export function classifyItem(item: FullItem, response: ResponseRecord | null): Pick<ItemResult, "outcome" | "tag" | "tagKind"> {
  if (!response || !response.answerId || !response.reasonId) {
    return { outcome: "incomplete", tag: null, tagKind: null };
  }
  const key = item.teacher_only;
  const answerOk = response.answerId === key.expected_answer_id;
  const reasonOk = response.reasonId === key.expected_reason_id;
  const tag = reasonOk ? null : key.reason_interpretations[response.reasonId] ?? null;
  const tagKind = tag ? tagInfo(tag).kind : null;
  if (answerOk && reasonOk) return { outcome: "expected", tag: null, tagKind: null };
  if (tagKind === "uncertain") return { outcome: "uncertain", tag, tagKind };
  if (!answerOk && reasonOk) return { outcome: "mixed", tag: null, tagKind: null };
  if (answerOk) return { outcome: "partial", tag, tagKind };
  return { outcome: "difficulty", tag, tagKind };
}

// ------------------------------------------------------------- learner level

export type LearnerCheckSummary =
  | "reasoning_shown" // every item: expected answer + expected reason
  | "worth_another_look" // every item shows a mapped possible difficulty
  | "mixed" // contradictory or mixed evidence across/within items
  | "unsure" // every item answered with "I am not sure"
  | "incomplete" // some but not all answer+reason pairs present
  | "not_started"; // no response at all

export const SUMMARY_LABEL: Record<LearnerCheckSummary, string> = {
  reasoning_shown: "Reasoning shown on this check",
  worth_another_look: "Worth another look",
  mixed: "Mixed evidence",
  unsure: "Unsure on this check",
  incomplete: "Not enough evidence",
  not_started: "No response yet",
};

export interface LearnerCheck {
  learnerId: string;
  summary: LearnerCheckSummary;
  complete: boolean;
  items: ItemResult[];
  tags: string[];
  confidence: Confidence[];
}

function latestReview(reviews: TeacherReview[], responseId: string, kind: TeacherReview["kind"]) {
  let found: TeacherReview | undefined;
  for (const r of reviews) {
    if (r.responseId === responseId && r.kind === kind && (!found || r.createdAt >= found.createdAt)) found = r;
  }
  return found;
}

export function summarizeLearner(
  run: CheckRun,
  learnerId: string,
  responses: ResponseRecord[],
  lookup: ItemLookup,
  reviews: TeacherReview[] = [],
): LearnerCheck {
  const mine = responses.filter((r) => r.checkRunId === run.id && r.learnerId === learnerId);
  const items: ItemResult[] = run.items.map((ref) => {
    const item = lookup(ref.itemId, ref.version);
    if (!item) throw new Error(`Unknown item ${ref.itemId}@${ref.version}`);
    // Only responses to the exact item version count for this run.
    const response = mine.find((r) => r.itemId === ref.itemId && r.itemVersion === ref.version) ?? null;
    const c = classifyItem(item, response);
    const hasText = !!response?.explanation?.trim();
    const review = response && hasText ? latestReview(reviews, response.id, "explanation_score") : undefined;
    return {
      itemId: ref.itemId,
      itemVersion: ref.version,
      response,
      ...c,
      explanation: !hasText ? "none" : review ? "reviewed" : "pending",
      explanationScore: review?.score ?? null,
    };
  });

  // A stored row with no answer (e.g. a paper sheet handed in blank) is a
  // response with insufficient evidence, not "not started".
  const anyResponse = items.some((i) => i.response);
  const complete = items.every((i) => i.outcome !== "incomplete");
  const outcomes = items.map((i) => i.outcome);
  let summary: LearnerCheckSummary;
  if (!anyResponse) summary = "not_started";
  else if (!complete) summary = "incomplete";
  else if (outcomes.every((o) => o === "expected")) summary = "reasoning_shown";
  else if (outcomes.every((o) => o === "uncertain")) summary = "unsure";
  else if (items.every((i) => (i.outcome === "difficulty" || i.outcome === "partial") && i.tag)) summary = "worth_another_look";
  else summary = "mixed";

  const tags = complete ? [...new Set(items.map((i) => i.tag).filter((t): t is string => !!t))] : [];
  const confidence = items.map((i) => i.response?.confidence).filter((c): c is Confidence => !!c);
  return { learnerId, summary, complete, items, tags, confidence };
}

// --------------------------------------------------------------- check level

export interface TagEvidence {
  tag: string;
  kind: TagKind;
  learnerIds: string[];
  responseIds: string[];
}

export interface ItemBreakdown {
  itemId: string;
  itemVersion: number;
  answered: number; // unique learners with answer + reason on this item
  outcomes: Record<ItemOutcome, number>;
  /** answerId|reasonId → unique learner count */
  pairs: { answerId: string; reasonId: string; count: number; learnerIds: string[] }[];
}

export interface CheckSummary {
  run: CheckRun;
  /** Eligible learners: everyone currently on the class roster. */
  eligible: number;
  complete: number;
  incomplete: number;
  notStarted: number;
  distribution: Record<LearnerCheckSummary, number>;
  learners: LearnerCheck[];
  tags: TagEvidence[];
  items: ItemBreakdown[];
  confidence: Record<Confidence, number> & { none: number };
  explanations: { pending: number; reviewed: number };
  sources: { student_device: number; paper_entered_by_teacher: number };
}

const EMPTY_DIST = (): Record<LearnerCheckSummary, number> => ({
  reasoning_shown: 0,
  worth_another_look: 0,
  mixed: 0,
  unsure: 0,
  incomplete: 0,
  not_started: 0,
});

export function summarizeCheck(
  run: CheckRun,
  learners: Learner[],
  responses: ResponseRecord[],
  lookup: ItemLookup,
  reviews: TeacherReview[] = [],
): CheckSummary {
  const eligibleIds = new Set(learners.filter((l) => l.classId === run.classId).map((l) => l.id));
  const runResponses = responses.filter((r) => r.checkRunId === run.id && eligibleIds.has(r.learnerId));
  const perLearner = [...eligibleIds].map((id) => summarizeLearner(run, id, runResponses, lookup, reviews));
  const distribution = EMPTY_DIST();
  for (const l of perLearner) distribution[l.summary]++;

  const tagMap = new Map<string, TagEvidence>();
  for (const l of perLearner) {
    if (!l.complete) continue; // recommendations use completed responses only
    for (const i of l.items) {
      if (!i.tag || !i.response) continue;
      const entry = tagMap.get(i.tag) ?? { tag: i.tag, kind: tagInfo(i.tag).kind, learnerIds: [], responseIds: [] };
      if (!entry.learnerIds.includes(l.learnerId)) entry.learnerIds.push(l.learnerId);
      entry.responseIds.push(i.response.id);
      tagMap.set(i.tag, entry);
    }
  }

  const items: ItemBreakdown[] = run.items.map((ref) => {
    const outcomes: Record<ItemOutcome, number> = { expected: 0, partial: 0, mixed: 0, difficulty: 0, uncertain: 0, incomplete: 0 };
    const pairs = new Map<string, { answerId: string; reasonId: string; count: number; learnerIds: string[] }>();
    let answered = 0;
    for (const l of perLearner) {
      const r = l.items.find((i) => i.itemId === ref.itemId)!;
      if (l.summary === "not_started") continue;
      outcomes[r.outcome]++;
      if (r.outcome === "incomplete" || !r.response) continue;
      answered++;
      const k = `${r.response.answerId}|${r.response.reasonId}`;
      const p = pairs.get(k) ?? { answerId: r.response.answerId!, reasonId: r.response.reasonId!, count: 0, learnerIds: [] };
      p.count++;
      p.learnerIds.push(l.learnerId);
      pairs.set(k, p);
    }
    return {
      itemId: ref.itemId,
      itemVersion: ref.version,
      answered,
      outcomes,
      pairs: [...pairs.values()].sort((a, b) => b.count - a.count),
    };
  });

  const confidence = { sure: 0, somewhat_sure: 0, unsure: 0, none: 0 };
  const explanations = { pending: 0, reviewed: 0 };
  const sourceLearners = { student_device: new Set<string>(), paper_entered_by_teacher: new Set<string>() };
  for (const l of perLearner) {
    for (const i of l.items) {
      if (i.response) {
        if (i.response.confidence) confidence[i.response.confidence]++;
        else confidence.none++;
        sourceLearners[i.response.source].add(l.learnerId);
      }
      if (i.explanation === "pending") explanations.pending++;
      if (i.explanation === "reviewed") explanations.reviewed++;
    }
  }

  return {
    run,
    eligible: eligibleIds.size,
    complete: perLearner.filter((l) => l.complete).length,
    incomplete: distribution.incomplete,
    notStarted: distribution.not_started,
    distribution,
    learners: perLearner,
    tags: [...tagMap.values()].sort((a, b) => b.learnerIds.length - a.learnerIds.length || a.tag.localeCompare(b.tag)),
    items,
    confidence,
    explanations,
    sources: {
      student_device: sourceLearners.student_device.size,
      paper_entered_by_teacher: sourceLearners.paper_entered_by_teacher.size,
    },
  };
}

/** Formats a share honestly: never "0%" when there is no eligible evidence. */
export function share(count: number, denominator: number): string {
  if (denominator <= 0) return "No evidence yet";
  return `${count} of ${denominator}`;
}

// ------------------------------------------------------ recommendation level

export type RecommendationKind = "activity" | "calculation" | "gather" | "extend";

export interface Recommendation {
  key: string; // tag, or "extension"
  kind: RecommendationKind;
  activityId: string;
  count: number; // unique learners with relevant completed responses
  denominator: number; // learners with a completed check
  learnerIds: string[];
  responseIds: string[];
  tag: string | null;
}

const KIND_ORDER: Record<RecommendationKind, number> = { activity: 0, calculation: 1, gather: 2, extend: 3 };

/**
 * Deterministic candidate ranking. Every candidate carries the exact learner
 * and response IDs behind it. No thresholds are applied: the count is shown and
 * the teacher decides. With no completed responses there is no recommendation.
 */
export function recommend(summary: CheckSummary, activityId: string): Recommendation[] {
  if (summary.complete === 0) return [];
  const out: Recommendation[] = summary.tags.map((t) => ({
    key: t.tag,
    kind: t.kind === "concept" ? "activity" : t.kind === "calculation" ? "calculation" : "gather",
    activityId,
    count: t.learnerIds.length,
    denominator: summary.complete,
    learnerIds: t.learnerIds,
    responseIds: t.responseIds,
    tag: t.tag,
  }));
  const shown = summary.learners.filter((l) => l.summary === "reasoning_shown");
  if (shown.length > 0) {
    out.push({
      key: "extension",
      kind: "extend",
      activityId,
      count: shown.length,
      denominator: summary.complete,
      learnerIds: shown.map((l) => l.learnerId),
      responseIds: shown.flatMap((l) => l.items.map((i) => i.response!.id)),
      tag: null,
    });
  }
  return out.sort((a, b) => {
    // A pattern that suggests teaching outranks the extension; then by count.
    if ((a.kind === "extend") !== (b.kind === "extend")) return a.kind === "extend" ? 1 : -1;
    return b.count - a.count || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key);
  });
}

// ------------------------------------------------------ before/exit matching

export type Comparison =
  | { comparable: false; reason: string }
  | {
      comparable: true;
      matched: number;
      matchedLearnerIds: string[];
      beforeShownInMatched: number;
      afterShownInMatched: number;
      afterShownAllRespondents: number;
      afterRespondents: number;
      beforeOnly: number; // completed before but not after
      afterOnly: number; // completed after but not before (unmatched)
      eligible: number;
      missingBoth: number;
    };

export function sameItemVersions(a: CheckRun, b: CheckRun): boolean {
  if (a.items.length !== b.items.length) return false;
  const key = (r: CheckRun) => r.items.map((i) => `${i.itemId}@${i.version}`).sort().join(",");
  return key(a) === key(b);
}

export function compareRuns(
  before: CheckRun,
  after: CheckRun,
  learners: Learner[],
  responses: ResponseRecord[],
  lookup: ItemLookup,
): Comparison {
  if (before.classId !== after.classId) return { comparable: false, reason: "These checks belong to different classes." };
  if (before.conceptId !== after.conceptId) return { comparable: false, reason: "These checks cover different concepts." };
  if (!sameItemVersions(before, after)) {
    return {
      comparable: false,
      reason: "These checks use different questions or question versions, so they give fresh evidence rather than a like-for-like comparison.",
    };
  }
  const b = summarizeCheck(before, learners, responses, lookup);
  const a = summarizeCheck(after, learners, responses, lookup);
  const bDone = new Map(b.learners.filter((l) => l.complete).map((l) => [l.learnerId, l]));
  const aDone = new Map(a.learners.filter((l) => l.complete).map((l) => [l.learnerId, l]));
  const matched = [...aDone.keys()].filter((id) => bDone.has(id));
  return {
    comparable: true,
    matched: matched.length,
    matchedLearnerIds: matched,
    beforeShownInMatched: matched.filter((id) => bDone.get(id)!.summary === "reasoning_shown").length,
    afterShownInMatched: matched.filter((id) => aDone.get(id)!.summary === "reasoning_shown").length,
    afterShownAllRespondents: [...aDone.values()].filter((l) => l.summary === "reasoning_shown").length,
    afterRespondents: aDone.size,
    beforeOnly: [...bDone.keys()].filter((id) => !aDone.has(id)).length,
    afterOnly: [...aDone.keys()].filter((id) => !bDone.has(id)).length,
    eligible: a.eligible,
    missingBoth: a.learners.filter((l) => !aDone.has(l.learnerId) && !bDone.has(l.learnerId)).length,
  };
}

// --------------------------------------------------------------- observations

export interface ObservationView {
  observation: Observation;
  scopeLabel: string;
  /** Only individual observations attach to a learner. */
  attachesToLearner: string | null;
}

export function observationsFor(
  bundle: Pick<ClassBundle, "observations" | "groups" | "learners">,
  filter: { conceptId?: string; sessionId?: string; learnerId?: string } = {},
): ObservationView[] {
  return bundle.observations
    .filter((o) => (filter.conceptId ? o.conceptId === filter.conceptId : true))
    .filter((o) => (filter.sessionId ? o.sessionId === filter.sessionId : true))
    .filter((o) => (filter.learnerId ? o.scope === "individual" && o.learnerId === filter.learnerId : true))
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt))
    .map((o) => {
      let scopeLabel = "Whole class";
      if (o.scope === "group") scopeLabel = bundle.groups.find((g) => g.id === o.groupId)?.label ?? "A group";
      if (o.scope === "individual") scopeLabel = bundle.learners.find((l) => l.id === o.learnerId)?.alias ?? "A learner";
      return { observation: o, scopeLabel, attachesToLearner: o.scope === "individual" ? o.learnerId : null };
    });
}

/** Learners covered by a group observation — for display context only, never scoring. */
export function groupMembers(bundle: Pick<ClassBundle, "groups">, groupId: string | null): string[] {
  return bundle.groups.find((g) => g.id === groupId)?.learnerIds ?? [];
}

// ------------------------------------------------------- learner × concept grid

export interface GridCell {
  conceptId: string;
  summary: LearnerCheckSummary | null; // null = no check in this concept yet
  runId: string | null;
  phase: string | null;
  date: string | null;
  individualObservations: number;
}

export function learnerConceptGrid(bundle: ClassBundle, lookup: ItemLookup, conceptIds: string[]) {
  const runsByConcept = new Map<string, CheckRun[]>();
  for (const run of bundle.checkRuns) {
    if (run.state === "draft") continue;
    const list = runsByConcept.get(run.conceptId) ?? [];
    list.push(run);
    runsByConcept.set(run.conceptId, list);
  }
  for (const list of runsByConcept.values()) list.sort((a, b) => (b.openedAt ?? b.createdAt).localeCompare(a.openedAt ?? a.createdAt));
  return bundle.learners.map((learner) => ({
    learner,
    cells: conceptIds.map((conceptId): GridCell => {
      // The learner's most recent check with their own response; else the latest check (shown as "No response yet").
      const runs = runsByConcept.get(conceptId) ?? [];
      const latest = runs.find((r) => bundle.responses.some((x) => x.checkRunId === r.id && x.learnerId === learner.id)) ?? runs[0];
      const obs = bundle.observations.filter((o) => o.scope === "individual" && o.learnerId === learner.id && o.conceptId === conceptId).length;
      if (!latest) return { conceptId, summary: null, runId: null, phase: null, date: null, individualObservations: obs };
      const s = summarizeLearner(latest, learner.id, bundle.responses, lookup, bundle.reviews);
      return {
        conceptId,
        summary: s.summary,
        runId: latest.id,
        phase: latest.phase,
        date: latest.openedAt ?? latest.createdAt,
        individualObservations: obs,
      };
    }),
  }));
}
