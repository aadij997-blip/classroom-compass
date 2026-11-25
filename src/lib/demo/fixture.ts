// Converts content/demo-fixture.json into a ClassBundle. Used to seed the
// isolated sample class and by tests. `prefix` namespaces IDs per demo workspace.

import fixture from "../../../content/demo-fixture.json";
import type {
  ClassBundle,
  ConceptId,
  Confidence,
  Mode,
  Phase,
  ResponseSource,
} from "@/lib/domain/types";

type Fx = typeof fixture;

const GOALS: Record<string, string> = {
  "opportunity-cost": "Identify the next-best alternative given up when making a choice.",
  diversification: "Explain why spreading exposure can reduce some concentration risks without guaranteeing profit.",
  liquidity: "Distinguish total asset value from cash available for an immediate payment.",
};

export function fixtureBundle(prefix = "", teacherId = "demo-teacher"): ClassBundle {
  const fx: Fx = fixture;
  const p = (id: string) => `${prefix}${id}`;
  const classId = p(fx.class.id);
  const created = "2026-11-18T16:00:00Z";
  const mode = (m: string): Mode => (m === "observation_only" ? "observation_only" : m === "paper" ? "paper" : "digital");

  return {
    class: {
      id: classId,
      teacherId,
      title: fx.class.title,
      gradeBand: fx.class.grade_band,
      createdAt: created,
    },
    learners: fx.learners.map((l, i) => ({
      id: p(l.id),
      classId,
      alias: l.alias,
      position: i + 1,
      hasAccess: true,
      createdAt: created,
    })),
    groups: fx.groups.map((g) => ({ id: p(g.id), classId, label: g.label, learnerIds: g.learner_ids.map(p) })),
    sessions: fx.sessions.map((s) => {
      const run = fx.check_runs.find((r) => r.session_id === s.id);
      return {
        id: p(s.id),
        classId,
        conceptId: s.concept_id as ConceptId,
        goal: GOALS[s.concept_id],
        mode: mode(s.mode),
        state: "teaching" as const,
        createdAt: run ? run.timestamp : "2026-11-19T16:00:00Z",
      };
    }),
    checkRuns: fx.check_runs.map((r) => ({
      id: p(r.id),
      sessionId: p(r.session_id),
      classId,
      conceptId: r.concept_id as ConceptId,
      phase: r.phase as Phase,
      items: r.item_ids.map((itemId, i) => ({ itemId, version: r.item_versions[i] })),
      state: r.state === "closed" ? "closed" : "open",
      createdAt: r.timestamp,
      openedAt: r.timestamp,
      closedAt: r.state === "closed" ? r.timestamp : null,
      followUpOfActionId: null,
    })),
    responses: fx.responses.map((r) => ({
      id: p(r.id),
      classId,
      learnerId: p(r.learner_id),
      checkRunId: p(r.check_run_id),
      itemId: r.item_id,
      itemVersion: r.item_version,
      answerId: r.answer_id,
      reasonId: r.reason_id,
      confidence: (r.confidence as Confidence | null) ?? null,
      explanation: r.explanation,
      source: r.source as ResponseSource,
      revision: 1,
      submittedAt: r.submitted_at,
      updatedAt: r.submitted_at,
    })),
    observations: fx.observations.map((o) => {
      const obs = o as typeof o & { tally?: number; denominator?: number; group_id?: string };
      return {
        id: p(o.id),
        classId,
        sessionId: o.session_id ? p(o.session_id) : null,
        conceptId: o.concept_id as ConceptId,
        scope: o.scope as "individual" | "group" | "class",
        learnerId: o.learner_id ? p(o.learner_id) : null,
        groupId: obs.group_id ? p(obs.group_id) : null,
        category: o.category,
        supports: null,
        note: o.note,
        tally: obs.tally ?? null,
        denominator: obs.denominator ?? null,
        observedOn: o.timestamp.slice(0, 10),
        createdAt: o.timestamp,
      };
    }),
    reviews: [],
    actions: fx.teaching_actions.map((a) => ({
      id: p(a.id),
      classId,
      sessionId: p(a.session_id),
      checkRunId: p(a.evidence_check_run_id),
      activityId: a.activity_id,
      recommendationKey: "assets-are-immediately-available-cash",
      evidenceResponseIds: [],
      audience: "individual" as const,
      learnerIds: a.learner_ids.map(p),
      groupId: null,
      decision: "accepted" as const,
      note: "Planned in the sample class.",
      taughtAt: a.completed_at,
      followUpCheckRunId: null,
      createdAt: "2026-11-24T17:30:00Z",
    })),
  };
}

export const FIXTURE_ASSERTIONS = fixture.expected_assertions;
