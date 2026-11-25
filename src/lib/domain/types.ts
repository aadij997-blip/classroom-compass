// Core domain types shared by storage backends, analytics, and views.
// Nothing in this file contains answer keys or scoring mappings.

export const CONCEPT_IDS = ["opportunity-cost", "diversification", "liquidity"] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export const PHASES = ["before", "exit", "recheck"] as const;
export type Phase = (typeof PHASES)[number];

export const MODES = ["digital", "paper", "observation_only"] as const;
export type Mode = (typeof MODES)[number];

export type ResponseSource = "student_device" | "paper_entered_by_teacher";
export const CONFIDENCE_VALUES = ["sure", "somewhat_sure", "unsure"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export type SessionState = "setup" | "collecting" | "teaching";
export type CheckRunState = "draft" | "open" | "closed";

export interface ItemRef {
  itemId: string;
  version: number;
}

export interface ClassRecord {
  id: string;
  teacherId: string;
  title: string;
  gradeBand: string;
  createdAt: string;
}

export interface Learner {
  id: string;
  classId: string;
  alias: string;
  /** Position used to order learners and print cards. */
  position: number;
  /** False once a teacher revokes the learner's private link (until reissued). */
  hasAccess: boolean;
  createdAt: string;
}

export interface Group {
  id: string;
  classId: string;
  label: string;
  learnerIds: string[];
}

export interface Session {
  id: string;
  classId: string;
  conceptId: ConceptId;
  goal: string;
  mode: Mode;
  state: SessionState;
  createdAt: string;
}

export interface CheckRun {
  id: string;
  sessionId: string;
  classId: string;
  conceptId: ConceptId;
  phase: Phase;
  items: ItemRef[];
  state: CheckRunState;
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  /** Teaching action this follow-up check was launched from, if any. */
  followUpOfActionId: string | null;
}

export interface ResponseRecord {
  id: string;
  classId: string;
  learnerId: string;
  checkRunId: string;
  itemId: string;
  itemVersion: number;
  answerId: string | null;
  reasonId: string | null;
  confidence: Confidence | null;
  explanation: string | null;
  source: ResponseSource;
  revision: number;
  submittedAt: string;
  updatedAt: string;
}

export type ObservationScope = "individual" | "group" | "class";

export interface Observation {
  id: string;
  classId: string;
  sessionId: string | null;
  conceptId: ConceptId;
  scope: ObservationScope;
  learnerId: string | null;
  groupId: string | null;
  category: string;
  supports: string | null;
  note: string;
  tally: number | null;
  denominator: number | null;
  observedOn: string;
  createdAt: string;
}

export type ReviewKind = "explanation_score" | "interpretation_note";
export type ReviewStance = "agree" | "disagree" | "context";

export interface TeacherReview {
  id: string;
  classId: string;
  responseId: string;
  kind: ReviewKind;
  score: 0 | 1 | 2 | null;
  stance: ReviewStance | null;
  note: string;
  createdAt: string;
}

export type Audience = "whole_class" | "small_group" | "individual";
export type ActionDecision = "suggested" | "accepted" | "dismissed";

export interface TeachingAction {
  id: string;
  classId: string;
  sessionId: string;
  checkRunId: string | null;
  activityId: string;
  recommendationKey: string;
  evidenceResponseIds: string[];
  audience: Audience;
  learnerIds: string[];
  groupId: string | null;
  decision: ActionDecision;
  note: string;
  taughtAt: string | null;
  followUpCheckRunId: string | null;
  createdAt: string;
}

/** Everything a teacher can see about one class. Loaded only after ownership is verified. */
export interface ClassBundle {
  class: ClassRecord;
  learners: Learner[];
  groups: Group[];
  sessions: Session[];
  checkRuns: CheckRun[];
  responses: ResponseRecord[];
  observations: Observation[];
  reviews: TeacherReview[];
  actions: TeachingAction[];
}

export interface IssuedToken {
  learnerId: string;
  alias: string;
  /** Plain token: shown once to the teacher for printing, never stored. */
  token: string;
}
