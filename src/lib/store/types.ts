import type {
  ActionDecision,
  Audience,
  CheckRunState,
  ClassBundle,
  ClassRecord,
  ConceptId,
  Confidence,
  IssuedToken,
  ItemRef,
  Mode,
  ObservationScope,
  Phase,
  ResponseRecord,
  ReviewKind,
  ReviewStance,
  SessionState,
} from "@/lib/domain/types";

export class StoreError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "closed" | "invalid" | "conflict" | "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

export interface ClassListItem {
  class: ClassRecord;
  learnerCount: number;
  sessionCount: number;
  lastActivityAt: string;
  /** Most recent session that still has an open check or is not yet in teaching. */
  resumeSessionId: string | null;
}

export interface NewObservation {
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
}

export interface PaperEntry {
  learnerId: string;
  itemId: string;
  /** null + null with `clear` removes an entry; null + null without clear = handed in blank. */
  answerId: string | null;
  reasonId: string | null;
  clear?: boolean;
}

export interface NewAction {
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
}

export interface ActionPatch {
  audience?: Audience;
  learnerIds?: string[];
  groupId?: string | null;
  decision?: ActionDecision;
  note?: string;
  taught?: boolean;
  followUpCheckRunId?: string;
}

/** Teacher operations. Every method verifies that `teacherId` owns the target. */
export interface TeacherStore {
  listClasses(teacherId: string): Promise<ClassListItem[]>;
  createClass(teacherId: string, input: { title: string; gradeBand: string; learnerCount: number }): Promise<{ classId: string; tokens: IssuedToken[] }>;
  deleteClass(teacherId: string, classId: string): Promise<void>;
  getClassBundle(teacherId: string, classId: string): Promise<ClassBundle | null>;
  findClassId(teacherId: string, kind: "session" | "checkRun" | "action", id: string): Promise<string | null>;
  addLearners(teacherId: string, classId: string, count: number): Promise<IssuedToken[]>;
  issueTokens(teacherId: string, classId: string, learnerIds: string[]): Promise<IssuedToken[]>;
  revokeLearner(teacherId: string, classId: string, learnerId: string): Promise<void>;
  saveGroup(teacherId: string, classId: string, input: { id?: string; label: string; learnerIds: string[] }): Promise<string>;
  deleteGroup(teacherId: string, classId: string, groupId: string): Promise<void>;
  createSession(teacherId: string, input: { classId: string; conceptId: ConceptId; goal: string; mode: Mode; phase: Phase | null; items: ItemRef[] | null }): Promise<{ sessionId: string; checkRunId: string | null }>;
  setSessionState(teacherId: string, sessionId: string, state: SessionState): Promise<void>;
  createCheckRun(teacherId: string, input: { sessionId: string; phase: Phase; items: ItemRef[]; followUpOfActionId: string | null }): Promise<string>;
  setCheckRunState(teacherId: string, checkRunId: string, state: Exclude<CheckRunState, "draft">): Promise<void>;
  savePaperEntries(teacherId: string, checkRunId: string, entries: PaperEntry[]): Promise<{ changed: number }>;
  addObservation(teacherId: string, classId: string, input: NewObservation): Promise<string>;
  addReview(teacherId: string, classId: string, input: { responseId: string; kind: ReviewKind; score: 0 | 1 | 2 | null; stance: ReviewStance | null; note: string }): Promise<string>;
  createAction(teacherId: string, classId: string, input: NewAction): Promise<string>;
  updateAction(teacherId: string, actionId: string, patch: ActionPatch): Promise<void>;
  responseHistory(teacherId: string, responseId: string): Promise<ResponseRevision[]>;
}

export interface ResponseRevision {
  responseId: string;
  revision: number;
  answerId: string | null;
  reasonId: string | null;
  confidence: Confidence | null;
  explanation: string | null;
  source: string;
  changedAt: string;
  changedBy: "learner" | "teacher";
}

export interface LearnerOpenRun {
  id: string;
  conceptId: ConceptId;
  phase: Phase;
  items: ItemRef[];
}

export interface LearnerContext {
  learnerId: string;
  alias: string;
  openRuns: LearnerOpenRun[];
  /** Only this learner's own responses for currently open runs. */
  responses: Pick<ResponseRecord, "checkRunId" | "itemId" | "answerId" | "reasonId" | "confidence" | "explanation">[];
}

export interface LearnerAnswer {
  itemId: string;
  answerId: string | null;
  reasonId: string | null;
  confidence: Confidence | null;
  explanation: string | null;
}

/** Learner operations. Authorization comes only from the hashed session token. */
export interface LearnerStore {
  exchangeToken(token: string): Promise<{ sessionToken: string; expiresAt: string } | null>;
  learnerContext(sessionToken: string): Promise<LearnerContext | null>;
  submit(sessionToken: string, input: { checkRunId: string; submissionId: string; answers: LearnerAnswer[] }): Promise<{ saved: number; duplicate: boolean }>;
}

export type Store = TeacherStore & LearnerStore;
