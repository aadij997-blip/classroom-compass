import "server-only";
// SQLite backend (Node's built-in node:sqlite). Used for the isolated sample
// class (in-memory) and the local trial workspace (file). Mirrors the Postgres
// schema in supabase/migrations; ownership is enforced in every query.

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ClassBundle,
  IssuedToken,
  ItemRef,
  ResponseRecord,
} from "@/lib/domain/types";
import {
  StoreError,
  type ActionPatch,
  type ClassListItem,
  type LearnerContext,
  type LearnerStore,
  type NewAction,
  type NewObservation,
  type PaperEntry,
  type ResponseRevision,
  type TeacherStore,
} from "./types";
import { aliasFor, cleanText, hashToken, LEARNER_SESSION_HOURS, MAX_EXPLANATION, newToken, validateAnswer } from "./validate";

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS teacher_sessions (
  token_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  grade_band TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes(teacher_id);
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  alias TEXT NOT NULL, position INTEGER NOT NULL, token_hash TEXT UNIQUE, created_at TEXT NOT NULL,
  UNIQUE(class_id, position));
CREATE TABLE IF NOT EXISTS learner_sessions (
  token_hash TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS groups_ (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, PRIMARY KEY (group_id, learner_id));
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL CHECK (concept_id IN ('opportunity-cost','diversification','liquidity')),
  goal TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('digital','paper','observation_only')),
  state TEXT NOT NULL CHECK (state IN ('setup','collecting','teaching')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS check_runs (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, concept_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('before','exit','recheck')), items TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','open','closed')), created_at TEXT NOT NULL,
  opened_at TEXT, closed_at TEXT, follow_up_of_action_id TEXT);
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  check_run_id TEXT NOT NULL REFERENCES check_runs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL, item_version INTEGER NOT NULL, answer_id TEXT, reason_id TEXT,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('sure','somewhat_sure','unsure')),
  explanation TEXT CHECK (explanation IS NULL OR length(explanation) <= ${MAX_EXPLANATION}),
  source TEXT NOT NULL CHECK (source IN ('student_device','paper_entered_by_teacher')),
  revision INTEGER NOT NULL DEFAULT 1, submitted_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (check_run_id, learner_id, item_id));
CREATE TABLE IF NOT EXISTS response_revisions (
  response_id TEXT NOT NULL, revision INTEGER NOT NULL, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  answer_id TEXT, reason_id TEXT, confidence TEXT, explanation TEXT, source TEXT NOT NULL,
  changed_at TEXT NOT NULL, changed_by TEXT NOT NULL, PRIMARY KEY (response_id, revision));
CREATE TABLE IF NOT EXISTS submission_receipts (
  id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  check_run_id TEXT NOT NULL REFERENCES check_runs(id) ON DELETE CASCADE, saved INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, concept_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('individual','group','class')),
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE, group_id TEXT REFERENCES groups_(id) ON DELETE CASCADE,
  category TEXT NOT NULL, supports TEXT, note TEXT NOT NULL, tally INTEGER, denominator INTEGER,
  observed_on TEXT NOT NULL, created_at TEXT NOT NULL,
  CHECK ((scope = 'individual' AND learner_id IS NOT NULL AND group_id IS NULL)
      OR (scope = 'group' AND group_id IS NOT NULL AND learner_id IS NULL)
      OR (scope = 'class' AND learner_id IS NULL AND group_id IS NULL)),
  CHECK (tally IS NULL OR (tally >= 0 AND (denominator IS NULL OR tally <= denominator))));
CREATE TABLE IF NOT EXISTS teacher_reviews (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('explanation_score','interpretation_note')),
  score INTEGER CHECK (score IS NULL OR score IN (0,1,2)), stance TEXT, note TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS teaching_actions (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, check_run_id TEXT,
  activity_id TEXT NOT NULL, recommendation_key TEXT NOT NULL, evidence_response_ids TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('whole_class','small_group','individual')),
  learner_ids TEXT NOT NULL, group_id TEXT, decision TEXT NOT NULL CHECK (decision IN ('suggested','accepted','dismissed')),
  note TEXT NOT NULL, taught_at TEXT, follow_up_check_run_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS demo_workspaces (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
`;

type Row = Record<string, SQLInputValue>;
const now = () => new Date().toISOString();

export class SqliteStore implements TeacherStore, LearnerStore {
  readonly db: DatabaseSync;
  constructor(
    file: string,
    private tokenPrefix: string,
  ) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  private all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  private get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  private run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params);
  }
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // ---------------------------------------------------------------- ownership
  private ownClass(teacherId: string, classId: string) {
    const row = this.get("SELECT id FROM classes WHERE id = ? AND teacher_id = ?", classId, teacherId);
    if (!row) throw new StoreError("not_found", "Class not found.");
  }
  private ownedRun(teacherId: string, checkRunId: string) {
    const row = this.get<{ id: string; class_id: string; session_id: string; state: string; items: string; concept_id: string }>(
      `SELECT r.id, r.class_id, r.session_id, r.state, r.items, r.concept_id FROM check_runs r
       JOIN classes c ON c.id = r.class_id WHERE r.id = ? AND c.teacher_id = ?`,
      checkRunId,
      teacherId,
    );
    if (!row) throw new StoreError("not_found", "Check not found.");
    return { ...row, items: JSON.parse(row.items) as ItemRef[] };
  }
  private ownedSession(teacherId: string, sessionId: string) {
    const row = this.get<{ id: string; class_id: string; concept_id: string }>(
      `SELECT s.id, s.class_id, s.concept_id FROM sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?`,
      sessionId,
      teacherId,
    );
    if (!row) throw new StoreError("not_found", "Session not found.");
    return row;
  }
  private assertLearners(classId: string, learnerIds: string[]) {
    for (const id of learnerIds) {
      if (!this.get("SELECT 1 FROM learners WHERE id = ? AND class_id = ?", id, classId)) {
        throw new StoreError("invalid", "A learner does not belong to this class.");
      }
    }
  }

  // ---------------------------------------------------------------- classes
  async listClasses(teacherId: string): Promise<ClassListItem[]> {
    const classes = this.all<{ id: string; teacher_id: string; title: string; grade_band: string; created_at: string }>(
      "SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC",
      teacherId,
    );
    return classes.map((c) => {
      const learnerCount = (this.get<{ n: number }>("SELECT count(*) n FROM learners WHERE class_id = ?", c.id)!).n;
      const sessions = this.all<{ id: string; state: string; created_at: string }>(
        "SELECT id, state, created_at FROM sessions WHERE class_id = ? ORDER BY created_at DESC",
        c.id,
      );
      const openRun = this.get<{ session_id: string }>(
        "SELECT session_id FROM check_runs WHERE class_id = ? AND state = 'open' ORDER BY opened_at DESC LIMIT 1",
        c.id,
      );
      const lastResp = this.get<{ t: string | null }>("SELECT max(updated_at) t FROM responses WHERE class_id = ?", c.id)?.t;
      const resume = openRun?.session_id ?? sessions.find((s) => s.state !== "teaching")?.id ?? null;
      const last = [c.created_at, sessions[0]?.created_at, lastResp].filter(Boolean).sort().at(-1)!;
      return {
        class: { id: c.id, teacherId: c.teacher_id, title: c.title, gradeBand: c.grade_band, createdAt: c.created_at },
        learnerCount,
        sessionCount: sessions.length,
        lastActivityAt: last,
        resumeSessionId: resume,
      };
    });
  }

  async createClass(teacherId: string, input: { title: string; gradeBand: string; learnerCount: number }) {
    const title = cleanText(input.title, 80);
    if (!title) throw new StoreError("invalid", "Give the class a name.");
    const count = Math.max(0, Math.min(60, Math.floor(input.learnerCount)));
    const classId = randomUUID();
    const tokens = this.tx(() => {
      this.run("INSERT INTO classes (id, teacher_id, title, grade_band, created_at) VALUES (?,?,?,?,?)", classId, teacherId, title, input.gradeBand, now());
      return this.insertLearners(classId, count);
    });
    return { classId, tokens };
  }

  private insertLearners(classId: string, count: number): IssuedToken[] {
    const maxPos = this.get<{ m: number | null }>("SELECT max(position) m FROM learners WHERE class_id = ?", classId)?.m ?? 0;
    const out: IssuedToken[] = [];
    for (let i = 1; i <= count; i++) {
      const position = maxPos + i;
      const id = randomUUID();
      const token = newToken(this.tokenPrefix);
      const alias = aliasFor(position);
      this.run("INSERT INTO learners (id, class_id, alias, position, token_hash, created_at) VALUES (?,?,?,?,?,?)", id, classId, alias, position, hashToken(token), now());
      out.push({ learnerId: id, alias, token });
    }
    return out;
  }

  async deleteClass(teacherId: string, classId: string) {
    this.ownClass(teacherId, classId);
    // ON DELETE CASCADE removes learners (and so their sessions/tokens), groups,
    // sessions, check runs, responses, revisions, observations, reviews, actions.
    this.run("DELETE FROM classes WHERE id = ? AND teacher_id = ?", classId, teacherId);
  }

  async getClassBundle(teacherId: string, classId: string): Promise<ClassBundle | null> {
    const c = this.get<{ id: string; teacher_id: string; title: string; grade_band: string; created_at: string }>(
      "SELECT * FROM classes WHERE id = ? AND teacher_id = ?",
      classId,
      teacherId,
    );
    if (!c) return null;
    const learners = this.all<{ id: string; alias: string; position: number; token_hash: string | null; created_at: string }>(
      "SELECT id, alias, position, token_hash, created_at FROM learners WHERE class_id = ? ORDER BY position",
      classId,
    );
    const groups = this.all<{ id: string; label: string }>("SELECT id, label FROM groups_ WHERE class_id = ? ORDER BY label", classId);
    const members = this.all<{ group_id: string; learner_id: string }>(
      "SELECT m.group_id, m.learner_id FROM group_members m JOIN groups_ g ON g.id = m.group_id WHERE g.class_id = ?",
      classId,
    );
    return {
      class: { id: c.id, teacherId: c.teacher_id, title: c.title, gradeBand: c.grade_band, createdAt: c.created_at },
      learners: learners.map((l) => ({ id: l.id, classId, alias: l.alias, position: l.position, hasAccess: !!l.token_hash, createdAt: l.created_at })),
      groups: groups.map((g) => ({ id: g.id, classId, label: g.label, learnerIds: members.filter((m) => m.group_id === g.id).map((m) => m.learner_id) })),
      sessions: this.all<Row>("SELECT * FROM sessions WHERE class_id = ? ORDER BY created_at DESC", classId).map((s) => ({
        id: s.id as string,
        classId,
        conceptId: s.concept_id as never,
        goal: s.goal as string,
        mode: s.mode as never,
        state: s.state as never,
        createdAt: s.created_at as string,
      })),
      checkRuns: this.all<Row>("SELECT * FROM check_runs WHERE class_id = ? ORDER BY created_at", classId).map((r) => ({
        id: r.id as string,
        sessionId: r.session_id as string,
        classId,
        conceptId: r.concept_id as never,
        phase: r.phase as never,
        items: JSON.parse(r.items as string),
        state: r.state as never,
        createdAt: r.created_at as string,
        openedAt: (r.opened_at as string) ?? null,
        closedAt: (r.closed_at as string) ?? null,
        followUpOfActionId: (r.follow_up_of_action_id as string) ?? null,
      })),
      responses: this.all<Row>("SELECT * FROM responses WHERE class_id = ?", classId).map(rowToResponse),
      observations: this.all<Row>("SELECT * FROM observations WHERE class_id = ?", classId).map((o) => ({
        id: o.id as string,
        classId,
        sessionId: (o.session_id as string) ?? null,
        conceptId: o.concept_id as never,
        scope: o.scope as never,
        learnerId: (o.learner_id as string) ?? null,
        groupId: (o.group_id as string) ?? null,
        category: o.category as string,
        supports: (o.supports as string) ?? null,
        note: o.note as string,
        tally: (o.tally as number) ?? null,
        denominator: (o.denominator as number) ?? null,
        observedOn: o.observed_on as string,
        createdAt: o.created_at as string,
      })),
      reviews: this.all<Row>("SELECT * FROM teacher_reviews WHERE class_id = ? ORDER BY created_at", classId).map((r) => ({
        id: r.id as string,
        classId,
        responseId: r.response_id as string,
        kind: r.kind as never,
        score: (r.score as 0 | 1 | 2 | null) ?? null,
        stance: (r.stance as never) ?? null,
        note: r.note as string,
        createdAt: r.created_at as string,
      })),
      actions: this.all<Row>("SELECT * FROM teaching_actions WHERE class_id = ? ORDER BY created_at", classId).map((a) => ({
        id: a.id as string,
        classId,
        sessionId: a.session_id as string,
        checkRunId: (a.check_run_id as string) ?? null,
        activityId: a.activity_id as string,
        recommendationKey: a.recommendation_key as string,
        evidenceResponseIds: JSON.parse(a.evidence_response_ids as string),
        audience: a.audience as never,
        learnerIds: JSON.parse(a.learner_ids as string),
        groupId: (a.group_id as string) ?? null,
        decision: a.decision as never,
        note: a.note as string,
        taughtAt: (a.taught_at as string) ?? null,
        followUpCheckRunId: (a.follow_up_check_run_id as string) ?? null,
        createdAt: a.created_at as string,
      })),
    };
  }

  async findClassId(teacherId: string, kind: "session" | "checkRun" | "action", id: string) {
    const table = kind === "session" ? "sessions" : kind === "checkRun" ? "check_runs" : "teaching_actions";
    const row = this.get<{ class_id: string }>(
      `SELECT t.class_id FROM ${table} t JOIN classes c ON c.id = t.class_id WHERE t.id = ? AND c.teacher_id = ?`,
      id,
      teacherId,
    );
    return row?.class_id ?? null;
  }

  // ---------------------------------------------------------------- learners
  async addLearners(teacherId: string, classId: string, count: number) {
    this.ownClass(teacherId, classId);
    const n = Math.max(1, Math.min(20, Math.floor(count)));
    return this.tx(() => this.insertLearners(classId, n));
  }

  async issueTokens(teacherId: string, classId: string, learnerIds: string[]) {
    this.ownClass(teacherId, classId);
    this.assertLearners(classId, learnerIds);
    return this.tx(() =>
      learnerIds.map((id) => {
        const token = newToken(this.tokenPrefix);
        this.run("UPDATE learners SET token_hash = ? WHERE id = ? AND class_id = ?", hashToken(token), id, classId);
        // Rotating a card ends any session opened with the old card.
        this.run("DELETE FROM learner_sessions WHERE learner_id = ?", id);
        const alias = this.get<{ alias: string }>("SELECT alias FROM learners WHERE id = ?", id)!.alias;
        return { learnerId: id, alias, token };
      }),
    );
  }

  async revokeLearner(teacherId: string, classId: string, learnerId: string) {
    this.ownClass(teacherId, classId);
    this.assertLearners(classId, [learnerId]);
    this.tx(() => {
      this.run("UPDATE learners SET token_hash = NULL WHERE id = ? AND class_id = ?", learnerId, classId);
      this.run("DELETE FROM learner_sessions WHERE learner_id = ?", learnerId);
    });
  }

  async saveGroup(teacherId: string, classId: string, input: { id?: string; label: string; learnerIds: string[] }) {
    this.ownClass(teacherId, classId);
    const label = cleanText(input.label, 40);
    if (!label) throw new StoreError("invalid", "Give the group a label.");
    this.assertLearners(classId, input.learnerIds);
    const id = input.id ?? randomUUID();
    this.tx(() => {
      if (input.id) {
        const g = this.get("SELECT id FROM groups_ WHERE id = ? AND class_id = ?", input.id, classId);
        if (!g) throw new StoreError("not_found", "Group not found.");
        this.run("UPDATE groups_ SET label = ? WHERE id = ?", label, id);
        this.run("DELETE FROM group_members WHERE group_id = ?", id);
      } else {
        this.run("INSERT INTO groups_ (id, class_id, label) VALUES (?,?,?)", id, classId, label);
      }
      for (const l of new Set(input.learnerIds)) this.run("INSERT INTO group_members (group_id, learner_id) VALUES (?,?)", id, l);
    });
    return id;
  }

  async deleteGroup(teacherId: string, classId: string, groupId: string) {
    this.ownClass(teacherId, classId);
    this.run("DELETE FROM groups_ WHERE id = ? AND class_id = ?", groupId, classId);
  }

  // ---------------------------------------------------------------- sessions
  async createSession(teacherId: string, input: Parameters<TeacherStore["createSession"]>[1]) {
    this.ownClass(teacherId, input.classId);
    const sessionId = randomUUID();
    let checkRunId: string | null = null;
    this.tx(() => {
      this.run(
        "INSERT INTO sessions (id, class_id, concept_id, goal, mode, state, created_at) VALUES (?,?,?,?,?,?,?)",
        sessionId,
        input.classId,
        input.conceptId,
        cleanText(input.goal, 240) ?? "",
        input.mode,
        "collecting",
        now(),
      );
      if (input.mode !== "observation_only" && input.phase && input.items) {
        checkRunId = randomUUID();
        this.run(
          "INSERT INTO check_runs (id, session_id, class_id, concept_id, phase, items, state, created_at) VALUES (?,?,?,?,?,?,?,?)",
          checkRunId,
          sessionId,
          input.classId,
          input.conceptId,
          input.phase,
          JSON.stringify(input.items),
          "draft",
          now(),
        );
      }
    });
    return { sessionId, checkRunId };
  }

  async setSessionState(teacherId: string, sessionId: string, state: "setup" | "collecting" | "teaching") {
    this.ownedSession(teacherId, sessionId);
    this.run("UPDATE sessions SET state = ? WHERE id = ?", state, sessionId);
  }

  async createCheckRun(teacherId: string, input: { sessionId: string; phase: "before" | "exit" | "recheck"; items: ItemRef[]; followUpOfActionId: string | null }) {
    const s = this.ownedSession(teacherId, input.sessionId);
    if (input.followUpOfActionId) {
      const a = this.get("SELECT id FROM teaching_actions WHERE id = ? AND class_id = ?", input.followUpOfActionId, s.class_id);
      if (!a) throw new StoreError("invalid", "Teaching action not found in this class.");
    }
    const id = randomUUID();
    this.tx(() => {
      this.run(
        "INSERT INTO check_runs (id, session_id, class_id, concept_id, phase, items, state, created_at, follow_up_of_action_id) VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        input.sessionId,
        s.class_id,
        s.concept_id,
        input.phase,
        JSON.stringify(input.items),
        "draft",
        now(),
        input.followUpOfActionId,
      );
      if (input.followUpOfActionId) {
        this.run("UPDATE teaching_actions SET follow_up_check_run_id = ? WHERE id = ?", id, input.followUpOfActionId);
      }
      this.run("UPDATE sessions SET state = 'collecting' WHERE id = ?", input.sessionId);
    });
    return id;
  }

  async setCheckRunState(teacherId: string, checkRunId: string, state: "open" | "closed") {
    const r = this.ownedRun(teacherId, checkRunId);
    if (state === "open") {
      this.run("UPDATE check_runs SET state = 'open', opened_at = coalesce(opened_at, ?), closed_at = NULL WHERE id = ?", now(), r.id);
      this.run("UPDATE sessions SET state = 'collecting' WHERE id = ?", r.session_id);
    } else {
      this.run("UPDATE check_runs SET state = 'closed', closed_at = ?, opened_at = coalesce(opened_at, ?) WHERE id = ?", now(), now(), r.id);
    }
  }

  // ---------------------------------------------------------------- responses
  /** Upsert one response with revision history. Returns true if anything changed. */
  private upsertResponse(
    classId: string,
    run: { id: string; items: ItemRef[] },
    learnerId: string,
    a: { itemId: string; answerId: string | null; reasonId: string | null; confidence: string | null; explanation: string | null },
    source: "student_device" | "paper_entered_by_teacher",
    by: "learner" | "teacher",
  ): boolean {
    const ref = run.items.find((i) => i.itemId === a.itemId)!;
    const existing = this.get<Row>("SELECT * FROM responses WHERE check_run_id = ? AND learner_id = ? AND item_id = ?", run.id, learnerId, a.itemId);
    const t = now();
    if (!existing) {
      this.run(
        `INSERT INTO responses (id, class_id, learner_id, check_run_id, item_id, item_version, answer_id, reason_id, confidence, explanation, source, revision, submitted_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        randomUUID(),
        classId,
        learnerId,
        run.id,
        a.itemId,
        ref.version,
        a.answerId,
        a.reasonId,
        a.confidence,
        a.explanation,
        source,
        t,
        t,
      );
      return true;
    }
    const same =
      existing.answer_id === a.answerId &&
      existing.reason_id === a.reasonId &&
      (existing.confidence ?? null) === a.confidence &&
      (existing.explanation ?? null) === a.explanation &&
      existing.source === source;
    if (same) return false;
    this.run(
      `INSERT INTO response_revisions (response_id, revision, class_id, answer_id, reason_id, confidence, explanation, source, changed_at, changed_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      existing.id,
      existing.revision,
      classId,
      existing.answer_id,
      existing.reason_id,
      existing.confidence,
      existing.explanation,
      existing.source,
      t,
      by,
    );
    this.run(
      "UPDATE responses SET answer_id = ?, reason_id = ?, confidence = ?, explanation = ?, source = ?, revision = revision + 1, updated_at = ? WHERE id = ?",
      a.answerId,
      a.reasonId,
      a.confidence,
      a.explanation,
      source,
      t,
      existing.id as string,
    );
    return true;
  }

  async savePaperEntries(teacherId: string, checkRunId: string, entries: PaperEntry[]) {
    const run = this.ownedRun(teacherId, checkRunId);
    if (run.state === "closed") throw new StoreError("closed", "This check is closed. Reopen it to enter or change paper responses.");
    this.assertLearners(run.class_id, [...new Set(entries.map((e) => e.learnerId))]);
    for (const e of entries) validateAnswer(run.items, { ...e, confidence: null, explanation: null });
    return this.tx(() => {
      let changed = 0;
      for (const e of entries) {
        if (e.clear) {
          const existing = this.get<Row>("SELECT * FROM responses WHERE check_run_id = ? AND learner_id = ? AND item_id = ?", run.id, e.learnerId, e.itemId);
          if (existing) {
            this.run(
              `INSERT INTO response_revisions (response_id, revision, class_id, answer_id, reason_id, confidence, explanation, source, changed_at, changed_by)
               VALUES (?,?,?,?,?,?,?,?,?,'teacher')`,
              existing.id,
              existing.revision,
              run.class_id,
              existing.answer_id,
              existing.reason_id,
              existing.confidence,
              existing.explanation,
              existing.source,
              now(),
            );
            this.run("DELETE FROM responses WHERE id = ?", existing.id as string);
            changed++;
          }
          continue;
        }
        const existing = this.get<Row>("SELECT confidence, explanation FROM responses WHERE check_run_id = ? AND learner_id = ? AND item_id = ?", run.id, e.learnerId, e.itemId);
        if (
          this.upsertResponse(
            run.class_id,
            run,
            e.learnerId,
            {
              itemId: e.itemId,
              answerId: e.answerId,
              reasonId: e.reasonId,
              confidence: (existing?.confidence as string) ?? null,
              explanation: (existing?.explanation as string) ?? null,
            },
            "paper_entered_by_teacher",
            "teacher",
          )
        )
          changed++;
      }
      return { changed };
    });
  }

  async responseHistory(teacherId: string, responseId: string): Promise<ResponseRevision[]> {
    const rows = this.all<Row>(
      `SELECT v.* FROM response_revisions v JOIN classes c ON c.id = v.class_id WHERE v.response_id = ? AND c.teacher_id = ? ORDER BY v.revision`,
      responseId,
      teacherId,
    );
    return rows.map((r) => ({
      responseId: r.response_id as string,
      revision: r.revision as number,
      answerId: (r.answer_id as string) ?? null,
      reasonId: (r.reason_id as string) ?? null,
      confidence: (r.confidence as never) ?? null,
      explanation: (r.explanation as string) ?? null,
      source: r.source as string,
      changedAt: r.changed_at as string,
      changedBy: r.changed_by as "learner" | "teacher",
    }));
  }

  // ------------------------------------------------- observations / reviews
  async addObservation(teacherId: string, classId: string, input: NewObservation) {
    this.ownClass(teacherId, classId);
    if (input.sessionId) {
      const s = this.ownedSession(teacherId, input.sessionId);
      if (s.class_id !== classId) throw new StoreError("invalid", "Session is not in this class.");
    }
    if (input.scope === "individual") {
      if (!input.learnerId) throw new StoreError("invalid", "Choose the learner this note is about.");
      this.assertLearners(classId, [input.learnerId]);
    }
    if (input.scope === "group") {
      if (!input.groupId || !this.get("SELECT 1 FROM groups_ WHERE id = ? AND class_id = ?", input.groupId, classId)) {
        throw new StoreError("invalid", "Choose a group from this class.");
      }
    }
    if (input.tally != null && input.denominator != null && input.tally > input.denominator) {
      throw new StoreError("invalid", "The tally cannot be larger than the number of learners counted.");
    }
    const note = cleanText(input.note) ?? "";
    const id = randomUUID();
    try {
      this.run(
        `INSERT INTO observations (id, class_id, session_id, concept_id, scope, learner_id, group_id, category, supports, note, tally, denominator, observed_on, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        classId,
        input.sessionId,
        input.conceptId,
        input.scope,
        input.scope === "individual" ? input.learnerId : null,
        input.scope === "group" ? input.groupId : null,
        input.category,
        cleanText(input.supports, 200),
        note,
        input.tally,
        input.denominator,
        input.observedOn,
        now(),
      );
    } catch {
      throw new StoreError("invalid", "That observation could not be saved. Check the scope and tally.");
    }
    return id;
  }

  async addReview(teacherId: string, classId: string, input: { responseId: string; kind: "explanation_score" | "interpretation_note"; score: 0 | 1 | 2 | null; stance: "agree" | "disagree" | "context" | null; note: string }) {
    this.ownClass(teacherId, classId);
    const resp = this.get("SELECT id FROM responses WHERE id = ? AND class_id = ?", input.responseId, classId);
    if (!resp) throw new StoreError("not_found", "Response not found in this class.");
    if (input.kind === "explanation_score" && (input.score === null || ![0, 1, 2].includes(input.score))) {
      throw new StoreError("invalid", "Choose a rubric score of 0, 1, or 2.");
    }
    const id = randomUUID();
    this.run(
      "INSERT INTO teacher_reviews (id, class_id, response_id, kind, score, stance, note, created_at) VALUES (?,?,?,?,?,?,?,?)",
      id,
      classId,
      input.responseId,
      input.kind,
      input.kind === "explanation_score" ? input.score : null,
      input.stance,
      cleanText(input.note) ?? "",
      now(),
    );
    return id;
  }

  // ---------------------------------------------------------------- actions
  async createAction(teacherId: string, classId: string, input: NewAction) {
    this.ownClass(teacherId, classId);
    const s = this.ownedSession(teacherId, input.sessionId);
    if (s.class_id !== classId) throw new StoreError("invalid", "Session is not in this class.");
    this.assertLearners(classId, input.learnerIds);
    if (input.groupId && !this.get("SELECT 1 FROM groups_ WHERE id = ? AND class_id = ?", input.groupId, classId)) {
      throw new StoreError("invalid", "Group not found in this class.");
    }
    const id = randomUUID();
    this.run(
      `INSERT INTO teaching_actions (id, class_id, session_id, check_run_id, activity_id, recommendation_key, evidence_response_ids, audience, learner_ids, group_id, decision, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      classId,
      input.sessionId,
      input.checkRunId,
      input.activityId,
      input.recommendationKey,
      JSON.stringify(input.evidenceResponseIds),
      input.audience,
      JSON.stringify(input.learnerIds),
      input.groupId,
      input.decision,
      cleanText(input.note) ?? "",
      now(),
    );
    this.run("UPDATE sessions SET state = 'teaching' WHERE id = ?", input.sessionId);
    return id;
  }

  async updateAction(teacherId: string, actionId: string, patch: ActionPatch) {
    const a = this.get<Row>(
      "SELECT a.* FROM teaching_actions a JOIN classes c ON c.id = a.class_id WHERE a.id = ? AND c.teacher_id = ?",
      actionId,
      teacherId,
    );
    if (!a) throw new StoreError("not_found", "Teaching action not found.");
    if (patch.learnerIds) this.assertLearners(a.class_id as string, patch.learnerIds);
    if (patch.groupId && !this.get("SELECT 1 FROM groups_ WHERE id = ? AND class_id = ?", patch.groupId, a.class_id as string)) {
      throw new StoreError("invalid", "Group not found in this class.");
    }
    this.run(
      `UPDATE teaching_actions SET audience = ?, learner_ids = ?, group_id = ?, decision = ?, note = ?, taught_at = ?, follow_up_check_run_id = ? WHERE id = ?`,
      patch.audience ?? (a.audience as string),
      patch.learnerIds ? JSON.stringify(patch.learnerIds) : (a.learner_ids as string),
      patch.groupId !== undefined ? patch.groupId : ((a.group_id as string) ?? null),
      patch.decision ?? (a.decision as string),
      patch.note !== undefined ? (cleanText(patch.note) ?? "") : (a.note as string),
      patch.taught === undefined ? ((a.taught_at as string) ?? null) : patch.taught ? ((a.taught_at as string) ?? now()) : null,
      patch.followUpCheckRunId ?? ((a.follow_up_check_run_id as string) ?? null),
      actionId,
    );
  }

  // ---------------------------------------------------------------- learners
  async exchangeToken(token: string) {
    if (!token.startsWith(this.tokenPrefix) || token.length > 80) return null;
    const learner = this.get<{ id: string }>("SELECT id FROM learners WHERE token_hash = ?", hashToken(token));
    if (!learner) return null;
    const sessionToken = newToken("ls_");
    const expiresAt = new Date(Date.now() + LEARNER_SESSION_HOURS * 3600_000).toISOString();
    this.run("DELETE FROM learner_sessions WHERE expires_at < ?", now());
    this.run("INSERT INTO learner_sessions (token_hash, learner_id, expires_at) VALUES (?,?,?)", hashToken(sessionToken), learner.id, expiresAt);
    return { sessionToken, expiresAt };
  }

  private learnerFromSession(sessionToken: string) {
    return this.get<{ id: string; class_id: string; alias: string }>(
      `SELECT l.id, l.class_id, l.alias FROM learner_sessions s JOIN learners l ON l.id = s.learner_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND l.token_hash IS NOT NULL`,
      hashToken(sessionToken),
      now(),
    );
  }

  async learnerContext(sessionToken: string): Promise<LearnerContext | null> {
    const l = this.learnerFromSession(sessionToken);
    if (!l) return null;
    const runs = this.all<Row>("SELECT id, concept_id, phase, items FROM check_runs WHERE class_id = ? AND state = 'open' ORDER BY opened_at DESC", l.class_id);
    const openRuns = runs.map((r) => ({ id: r.id as string, conceptId: r.concept_id as never, phase: r.phase as never, items: JSON.parse(r.items as string) }));
    const responses = openRuns.length
      ? this.all<Row>(
          `SELECT check_run_id, item_id, answer_id, reason_id, confidence, explanation FROM responses WHERE learner_id = ? AND check_run_id IN (${openRuns.map(() => "?").join(",")})`,
          l.id,
          ...openRuns.map((r) => r.id),
        ).map((r) => ({
          checkRunId: r.check_run_id as string,
          itemId: r.item_id as string,
          answerId: (r.answer_id as string) ?? null,
          reasonId: (r.reason_id as string) ?? null,
          confidence: (r.confidence as never) ?? null,
          explanation: (r.explanation as string) ?? null,
        }))
      : [];
    return { learnerId: l.id, alias: l.alias, openRuns, responses };
  }

  async submit(sessionToken: string, input: { checkRunId: string; submissionId: string; answers: { itemId: string; answerId: string | null; reasonId: string | null; confidence: "sure" | "somewhat_sure" | "unsure" | null; explanation: string | null }[] }) {
    const l = this.learnerFromSession(sessionToken);
    if (!l) throw new StoreError("forbidden", "Your link has expired or was replaced. Ask your teacher for your card.");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.submissionId)) throw new StoreError("invalid", "Invalid submission.");
    const run = this.get<Row>("SELECT id, class_id, state, items FROM check_runs WHERE id = ?", input.checkRunId);
    // Same message for "not your class" and "does not exist": no probing.
    if (!run || run.class_id !== l.class_id) throw new StoreError("not_found", "This check is not available.");
    if (run.state !== "open") throw new StoreError("closed", "This check is closed. Your teacher has stopped collecting answers.");
    const items = JSON.parse(run.items as string) as ItemRef[];
    if (input.answers.length === 0 || input.answers.length > items.length) throw new StoreError("invalid", "Nothing to save.");
    const answers = input.answers.map((a) => ({ ...a, explanation: cleanText(a.explanation, MAX_EXPLANATION) }));
    for (const a of answers) validateAnswer(items, a);

    return this.tx(() => {
      const prior = this.get<{ saved: number; learner_id: string }>("SELECT saved, learner_id FROM submission_receipts WHERE id = ?", input.submissionId);
      if (prior) {
        if (prior.learner_id !== l.id) throw new StoreError("conflict", "Invalid submission.");
        return { saved: prior.saved, duplicate: true };
      }
      let saved = 0;
      for (const a of answers) {
        if (this.upsertResponse(l.class_id, { id: run.id as string, items }, l.id, a, "student_device", "learner")) saved++;
      }
      this.run("INSERT INTO submission_receipts (id, learner_id, check_run_id, saved, created_at) VALUES (?,?,?,?,?)", input.submissionId, l.id, run.id as string, saved, now());
      return { saved, duplicate: false };
    });
  }

  // ---------------------------------------------------------------- demo seed
  importBundle(bundle: ClassBundle, tokenHashes: Map<string, string> = new Map()) {
    this.tx(() => {
      const b = bundle;
      this.run("INSERT INTO classes (id, teacher_id, title, grade_band, created_at) VALUES (?,?,?,?,?)", b.class.id, b.class.teacherId, b.class.title, b.class.gradeBand, b.class.createdAt);
      for (const l of b.learners) this.run("INSERT INTO learners (id, class_id, alias, position, token_hash, created_at) VALUES (?,?,?,?,?,?)", l.id, l.classId, l.alias, l.position, tokenHashes.get(l.id) ?? null, l.createdAt);
      for (const g of b.groups) {
        this.run("INSERT INTO groups_ (id, class_id, label) VALUES (?,?,?)", g.id, g.classId, g.label);
        for (const m of g.learnerIds) this.run("INSERT INTO group_members (group_id, learner_id) VALUES (?,?)", g.id, m);
      }
      for (const s of b.sessions) this.run("INSERT INTO sessions (id, class_id, concept_id, goal, mode, state, created_at) VALUES (?,?,?,?,?,?,?)", s.id, s.classId, s.conceptId, s.goal, s.mode, s.state, s.createdAt);
      for (const r of b.checkRuns)
        this.run(
          "INSERT INTO check_runs (id, session_id, class_id, concept_id, phase, items, state, created_at, opened_at, closed_at, follow_up_of_action_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          r.id, r.sessionId, r.classId, r.conceptId, r.phase, JSON.stringify(r.items), r.state, r.createdAt, r.openedAt, r.closedAt, r.followUpOfActionId,
        );
      for (const r of b.responses)
        this.run(
          `INSERT INTO responses (id, class_id, learner_id, check_run_id, item_id, item_version, answer_id, reason_id, confidence, explanation, source, revision, submitted_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          r.id, r.classId, r.learnerId, r.checkRunId, r.itemId, r.itemVersion, r.answerId, r.reasonId, r.confidence, r.explanation, r.source, r.revision, r.submittedAt, r.updatedAt,
        );
      for (const o of b.observations)
        this.run(
          `INSERT INTO observations (id, class_id, session_id, concept_id, scope, learner_id, group_id, category, supports, note, tally, denominator, observed_on, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          o.id, o.classId, o.sessionId, o.conceptId, o.scope, o.learnerId, o.groupId, o.category, o.supports, o.note, o.tally, o.denominator, o.observedOn, o.createdAt,
        );
      for (const a of b.actions)
        this.run(
          `INSERT INTO teaching_actions (id, class_id, session_id, check_run_id, activity_id, recommendation_key, evidence_response_ids, audience, learner_ids, group_id, decision, note, taught_at, follow_up_check_run_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          a.id, a.classId, a.sessionId, a.checkRunId, a.activityId, a.recommendationKey, JSON.stringify(a.evidenceResponseIds), a.audience, JSON.stringify(a.learnerIds), a.groupId, a.decision, a.note, a.taughtAt, a.followUpCheckRunId, a.createdAt,
        );
    });
  }

  deleteTeacherData(teacherId: string) {
    this.run("DELETE FROM classes WHERE teacher_id = ?", teacherId);
  }
}

function rowToResponse(r: Row): ResponseRecord {
  return {
    id: r.id as string,
    classId: r.class_id as string,
    learnerId: r.learner_id as string,
    checkRunId: r.check_run_id as string,
    itemId: r.item_id as string,
    itemVersion: r.item_version as number,
    answerId: (r.answer_id as string) ?? null,
    reasonId: (r.reason_id as string) ?? null,
    confidence: (r.confidence as never) ?? null,
    explanation: (r.explanation as string) ?? null,
    source: r.source as never,
    revision: r.revision as number,
    submittedAt: r.submitted_at as string,
    updatedAt: r.updated_at as string,
  };
}
