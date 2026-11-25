import "server-only";
// Supabase backend for configured classroom use. Teacher calls run with the
// teacher's own session so Postgres row-level security applies on top of the
// explicit ownership checks here. Learner calls go through SECURITY DEFINER
// RPCs with the anon key — no service-role key exists in this application.
//
// NOTE: this backend could not be exercised during the build (no Supabase
// credentials were available). See docs/VERIFICATION.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassBundle, IssuedToken, ItemRef } from "@/lib/domain/types";
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
import { aliasFor, cleanText, hashToken, MAX_EXPLANATION, newToken, validateAnswer } from "./validate";

type Row = Record<string, unknown>;

function fail(error: { message: string; code?: string } | null, fallback = "Something went wrong while saving."): never {
  const msg = error?.message ?? "";
  if (msg.includes("check closed")) throw new StoreError("closed", "This check is closed.");
  if (msg.includes("mismatch") || msg.includes("unknown") || msg.includes("not in check")) throw new StoreError("invalid", "That change does not match this class.");
  throw new StoreError("unavailable", fallback);
}

export class SupabaseTeacherStore implements TeacherStore {
  constructor(private db: SupabaseClient) {}

  private async ownClass(teacherId: string, classId: string) {
    const { data } = await this.db.from("classes").select("id").eq("id", classId).eq("teacher_id", teacherId).maybeSingle();
    if (!data) throw new StoreError("not_found", "Class not found.");
  }
  private async ownedRow(teacherId: string, table: string, id: string, cols = "*") {
    const { data } = await this.db.from(table).select(`${cols}, classes!inner(teacher_id)`).eq("id", id).eq("classes.teacher_id", teacherId).maybeSingle();
    if (!data) throw new StoreError("not_found", "Not found.");
    return data as unknown as Row;
  }
  private async assertLearners(classId: string, ids: string[]) {
    if (!ids.length) return;
    const { data } = await this.db.from("learners").select("id").eq("class_id", classId).in("id", ids);
    if ((data ?? []).length !== new Set(ids).size) throw new StoreError("invalid", "A learner does not belong to this class.");
  }

  async listClasses(teacherId: string): Promise<ClassListItem[]> {
    const { data: classes, error } = await this.db.from("classes").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false });
    if (error) fail(error, "Could not load classes.");
    const out: ClassListItem[] = [];
    for (const c of classes ?? []) {
      const [{ count }, { data: sessions }, { data: open }] = await Promise.all([
        this.db.from("learners").select("id", { count: "exact", head: true }).eq("class_id", c.id),
        this.db.from("sessions").select("id, state, created_at").eq("class_id", c.id).order("created_at", { ascending: false }),
        this.db.from("check_runs").select("session_id").eq("class_id", c.id).eq("state", "open").order("opened_at", { ascending: false }).limit(1),
      ]);
      out.push({
        class: { id: c.id, teacherId: c.teacher_id, title: c.title, gradeBand: c.grade_band, createdAt: c.created_at },
        learnerCount: count ?? 0,
        sessionCount: sessions?.length ?? 0,
        lastActivityAt: sessions?.[0]?.created_at ?? c.created_at,
        resumeSessionId: open?.[0]?.session_id ?? sessions?.find((s) => s.state !== "teaching")?.id ?? null,
      });
    }
    return out;
  }

  async createClass(teacherId: string, input: { title: string; gradeBand: string; learnerCount: number }) {
    const title = cleanText(input.title, 80);
    if (!title) throw new StoreError("invalid", "Give the class a name.");
    const { data, error } = await this.db.from("classes").insert({ teacher_id: teacherId, title, grade_band: input.gradeBand }).select("id").single();
    if (error || !data) fail(error, "Could not create the class.");
    const tokens = await this.insertLearners(data.id, Math.max(0, Math.min(60, Math.floor(input.learnerCount))), 0);
    return { classId: data.id as string, tokens };
  }

  private async insertLearners(classId: string, count: number, maxPos: number): Promise<IssuedToken[]> {
    if (count === 0) return [];
    const rows = Array.from({ length: count }, (_, i) => {
      const position = maxPos + i + 1;
      const token = newToken("c-");
      return { id: crypto.randomUUID(), class_id: classId, alias: aliasFor(position), position, token_hash: hashToken(token), token };
    });
    const { error } = await this.db.from("learners").insert(rows.map(({ token: _t, ...r }) => r));
    if (error) fail(error, "Could not add learners.");
    return rows.map((r) => ({ learnerId: r.id, alias: r.alias, token: r.token }));
  }

  async deleteClass(teacherId: string, classId: string) {
    await this.ownClass(teacherId, classId);
    const { error } = await this.db.from("classes").delete().eq("id", classId).eq("teacher_id", teacherId);
    if (error) fail(error, "Could not delete the class.");
  }

  async getClassBundle(teacherId: string, classId: string): Promise<ClassBundle | null> {
    const { data: c } = await this.db.from("classes").select("*").eq("id", classId).eq("teacher_id", teacherId).maybeSingle();
    if (!c) return null;
    const q = (t: string, cols = "*") => this.db.from(t).select(cols).eq("class_id", classId);
    const [learners, groups, members, sessions, runs, responses, observations, reviews, actions] = await Promise.all([
      q("learners", "id, class_id, alias, position, has_access, created_at").order("position"),
      q("groups"),
      this.db.from("group_members").select("group_id, learner_id, groups!inner(class_id)").eq("groups.class_id", classId),
      q("sessions").order("created_at", { ascending: false }),
      q("check_runs").order("created_at"),
      q("responses"),
      q("observations"),
      q("teacher_reviews").order("created_at"),
      q("teaching_actions").order("created_at"),
    ]);
    for (const r of [learners, groups, members, sessions, runs, responses, observations, reviews, actions]) if (r.error) fail(r.error, "Could not load the class.");
    const m = (members.data ?? []) as unknown as Row[];
    return {
      class: { id: c.id, teacherId: c.teacher_id, title: c.title, gradeBand: c.grade_band, createdAt: c.created_at },
      learners: ((learners.data ?? []) as unknown as Row[]).map((l) => ({ id: l.id as string, classId, alias: l.alias as string, position: l.position as number, hasAccess: !!l.has_access, createdAt: l.created_at as string })),
      groups: ((groups.data ?? []) as unknown as Row[]).map((g) => ({ id: g.id as string, classId, label: g.label as string, learnerIds: m.filter((x) => x.group_id === g.id).map((x) => x.learner_id as string) })),
      sessions: ((sessions.data ?? []) as unknown as Row[]).map((s) => ({ id: s.id as string, classId, conceptId: s.concept_id as never, goal: s.goal as string, mode: s.mode as never, state: s.state as never, createdAt: s.created_at as string })),
      checkRuns: ((runs.data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id as string, sessionId: r.session_id as string, classId, conceptId: r.concept_id as never, phase: r.phase as never,
        items: r.items as ItemRef[], state: r.state as never, createdAt: r.created_at as string,
        openedAt: (r.opened_at as string) ?? null, closedAt: (r.closed_at as string) ?? null, followUpOfActionId: (r.follow_up_of_action_id as string) ?? null,
      })),
      responses: ((responses.data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id as string, classId, learnerId: r.learner_id as string, checkRunId: r.check_run_id as string, itemId: r.item_id as string,
        itemVersion: r.item_version as number, answerId: (r.answer_id as string) ?? null, reasonId: (r.reason_id as string) ?? null,
        confidence: (r.confidence as never) ?? null, explanation: (r.explanation as string) ?? null, source: r.source as never,
        revision: r.revision as number, submittedAt: r.submitted_at as string, updatedAt: r.updated_at as string,
      })),
      observations: ((observations.data ?? []) as unknown as Row[]).map((o) => ({
        id: o.id as string, classId, sessionId: (o.session_id as string) ?? null, conceptId: o.concept_id as never, scope: o.scope as never,
        learnerId: (o.learner_id as string) ?? null, groupId: (o.group_id as string) ?? null, category: o.category as string,
        supports: (o.supports as string) ?? null, note: o.note as string, tally: (o.tally as number) ?? null,
        denominator: (o.denominator as number) ?? null, observedOn: o.observed_on as string, createdAt: o.created_at as string,
      })),
      reviews: ((reviews.data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id as string, classId, responseId: r.response_id as string, kind: r.kind as never, score: (r.score as 0 | 1 | 2 | null) ?? null,
        stance: (r.stance as never) ?? null, note: r.note as string, createdAt: r.created_at as string,
      })),
      actions: ((actions.data ?? []) as unknown as Row[]).map((a) => ({
        id: a.id as string, classId, sessionId: a.session_id as string, checkRunId: (a.check_run_id as string) ?? null,
        activityId: a.activity_id as string, recommendationKey: a.recommendation_key as string,
        evidenceResponseIds: a.evidence_response_ids as string[], audience: a.audience as never, learnerIds: a.learner_ids as string[],
        groupId: (a.group_id as string) ?? null, decision: a.decision as never, note: a.note as string,
        taughtAt: (a.taught_at as string) ?? null, followUpCheckRunId: (a.follow_up_check_run_id as string) ?? null, createdAt: a.created_at as string,
      })),
    };
  }

  async findClassId(teacherId: string, kind: "session" | "checkRun" | "action", id: string) {
    const table = kind === "session" ? "sessions" : kind === "checkRun" ? "check_runs" : "teaching_actions";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await this.db.from(table).select("class_id, classes!inner(teacher_id)").eq("id", id).eq("classes.teacher_id", teacherId).maybeSingle();
    return (data?.class_id as string) ?? null;
  }

  async addLearners(teacherId: string, classId: string, count: number) {
    await this.ownClass(teacherId, classId);
    const { data } = await this.db.from("learners").select("position").eq("class_id", classId).order("position", { ascending: false }).limit(1);
    return this.insertLearners(classId, Math.max(1, Math.min(20, Math.floor(count))), (data?.[0]?.position as number) ?? 0);
  }

  async issueTokens(teacherId: string, classId: string, learnerIds: string[]) {
    await this.ownClass(teacherId, classId);
    await this.assertLearners(classId, learnerIds);
    const out: IssuedToken[] = [];
    for (const id of learnerIds) {
      const token = newToken("c-");
      // The learners_token_changed trigger ends sessions opened with the old card.
      const { data, error } = await this.db.from("learners").update({ token_hash: hashToken(token) }).eq("id", id).eq("class_id", classId).select("alias").single();
      if (error || !data) fail(error, "Could not issue a new card.");
      out.push({ learnerId: id, alias: data.alias as string, token });
    }
    return out;
  }

  async revokeLearner(teacherId: string, classId: string, learnerId: string) {
    await this.ownClass(teacherId, classId);
    await this.assertLearners(classId, [learnerId]);
    const { error } = await this.db.from("learners").update({ token_hash: null }).eq("id", learnerId).eq("class_id", classId);
    if (error) fail(error, "Could not turn off this card.");
  }

  async saveGroup(teacherId: string, classId: string, input: { id?: string; label: string; learnerIds: string[] }) {
    await this.ownClass(teacherId, classId);
    const label = cleanText(input.label, 40);
    if (!label) throw new StoreError("invalid", "Give the group a label.");
    await this.assertLearners(classId, input.learnerIds);
    let id = input.id;
    if (id) {
      const { error } = await this.db.from("groups").update({ label }).eq("id", id).eq("class_id", classId);
      if (error) fail(error);
      await this.db.from("group_members").delete().eq("group_id", id);
    } else {
      const { data, error } = await this.db.from("groups").insert({ class_id: classId, label }).select("id").single();
      if (error || !data) fail(error);
      id = data.id as string;
    }
    if (input.learnerIds.length) {
      const { error } = await this.db.from("group_members").insert([...new Set(input.learnerIds)].map((l) => ({ group_id: id, learner_id: l })));
      if (error) fail(error);
    }
    return id!;
  }

  async deleteGroup(teacherId: string, classId: string, groupId: string) {
    await this.ownClass(teacherId, classId);
    await this.db.from("groups").delete().eq("id", groupId).eq("class_id", classId);
  }

  async createSession(teacherId: string, input: Parameters<TeacherStore["createSession"]>[1]) {
    await this.ownClass(teacherId, input.classId);
    const { data, error } = await this.db
      .from("sessions")
      .insert({ class_id: input.classId, concept_id: input.conceptId, goal: cleanText(input.goal, 240) ?? "", mode: input.mode, state: "collecting" })
      .select("id")
      .single();
    if (error || !data) fail(error, "Could not start the session.");
    let checkRunId: string | null = null;
    if (input.mode !== "observation_only" && input.phase && input.items) {
      const r = await this.db.from("check_runs").insert({ session_id: data.id, class_id: input.classId, concept_id: input.conceptId, phase: input.phase, items: input.items, state: "draft" }).select("id").single();
      if (r.error || !r.data) fail(r.error, "Could not prepare the check.");
      checkRunId = r.data.id as string;
    }
    return { sessionId: data.id as string, checkRunId };
  }

  async setSessionState(teacherId: string, sessionId: string, state: "setup" | "collecting" | "teaching") {
    await this.ownedRow(teacherId, "sessions", sessionId, "id");
    await this.db.from("sessions").update({ state }).eq("id", sessionId);
  }

  async createCheckRun(teacherId: string, input: { sessionId: string; phase: "before" | "exit" | "recheck"; items: ItemRef[]; followUpOfActionId: string | null }) {
    const s = await this.ownedRow(teacherId, "sessions", input.sessionId, "id, class_id, concept_id");
    const { data, error } = await this.db
      .from("check_runs")
      .insert({ session_id: input.sessionId, class_id: s.class_id, concept_id: s.concept_id, phase: input.phase, items: input.items, state: "draft", follow_up_of_action_id: input.followUpOfActionId })
      .select("id")
      .single();
    if (error || !data) fail(error, "Could not prepare the check.");
    if (input.followUpOfActionId) {
      await this.db.from("teaching_actions").update({ follow_up_check_run_id: data.id }).eq("id", input.followUpOfActionId).eq("class_id", s.class_id as string);
    }
    await this.db.from("sessions").update({ state: "collecting" }).eq("id", input.sessionId);
    return data.id as string;
  }

  async setCheckRunState(teacherId: string, checkRunId: string, state: "open" | "closed") {
    const r = await this.ownedRow(teacherId, "check_runs", checkRunId, "id, session_id, opened_at");
    const t = new Date().toISOString();
    const patch = state === "open" ? { state, opened_at: r.opened_at ?? t, closed_at: null } : { state, closed_at: t, opened_at: r.opened_at ?? t };
    const { error } = await this.db.from("check_runs").update(patch).eq("id", checkRunId);
    if (error) fail(error);
    if (state === "open") await this.db.from("sessions").update({ state: "collecting" }).eq("id", r.session_id as string);
  }

  async savePaperEntries(teacherId: string, checkRunId: string, entries: PaperEntry[]) {
    const r = await this.ownedRow(teacherId, "check_runs", checkRunId, "id, class_id, state, items");
    if (r.state === "closed") throw new StoreError("closed", "This check is closed. Reopen it to enter or change paper responses.");
    const items = r.items as ItemRef[];
    await this.assertLearners(r.class_id as string, [...new Set(entries.map((e) => e.learnerId))]);
    for (const e of entries) validateAnswer(items, { ...e, confidence: null, explanation: null });
    let changed = 0;
    for (const e of entries) {
      if (e.clear) {
        const { data } = await this.db.from("responses").delete().eq("check_run_id", checkRunId).eq("learner_id", e.learnerId).eq("item_id", e.itemId).select("id");
        changed += data?.length ?? 0;
        continue;
      }
      const ver = items.find((i) => i.itemId === e.itemId)!.version;
      const { data, error } = await this.db
        .from("responses")
        .upsert(
          { class_id: r.class_id, learner_id: e.learnerId, check_run_id: checkRunId, item_id: e.itemId, item_version: ver, answer_id: e.answerId, reason_id: e.reasonId, source: "paper_entered_by_teacher" },
          { onConflict: "check_run_id,learner_id,item_id" },
        )
        .select("id");
      if (error) fail(error, "Could not save the paper entry.");
      changed += data?.length ?? 0;
    }
    return { changed };
  }

  async responseHistory(teacherId: string, responseId: string): Promise<ResponseRevision[]> {
    const { data } = await this.db.from("response_revisions").select("*, classes!inner(teacher_id)").eq("response_id", responseId).eq("classes.teacher_id", teacherId).order("revision");
    return ((data ?? []) as Row[]).map((r) => ({
      responseId: r.response_id as string, revision: r.revision as number, answerId: (r.answer_id as string) ?? null,
      reasonId: (r.reason_id as string) ?? null, confidence: (r.confidence as never) ?? null, explanation: (r.explanation as string) ?? null,
      source: r.source as string, changedAt: r.changed_at as string, changedBy: r.changed_by as "learner" | "teacher",
    }));
  }

  async addObservation(teacherId: string, classId: string, input: NewObservation) {
    await this.ownClass(teacherId, classId);
    if (input.scope === "individual" && !input.learnerId) throw new StoreError("invalid", "Choose the learner this note is about.");
    if (input.scope === "group" && !input.groupId) throw new StoreError("invalid", "Choose a group from this class.");
    const { data, error } = await this.db
      .from("observations")
      .insert({
        class_id: classId, session_id: input.sessionId, concept_id: input.conceptId, scope: input.scope,
        learner_id: input.scope === "individual" ? input.learnerId : null, group_id: input.scope === "group" ? input.groupId : null,
        category: input.category, supports: cleanText(input.supports, 200), note: cleanText(input.note) ?? "",
        tally: input.tally, denominator: input.denominator, observed_on: input.observedOn,
      })
      .select("id")
      .single();
    if (error || !data) fail(error, "That observation could not be saved. Check the scope and tally.");
    return data.id as string;
  }

  async addReview(teacherId: string, classId: string, input: { responseId: string; kind: "explanation_score" | "interpretation_note"; score: 0 | 1 | 2 | null; stance: "agree" | "disagree" | "context" | null; note: string }) {
    await this.ownClass(teacherId, classId);
    const { data, error } = await this.db
      .from("teacher_reviews")
      .insert({ class_id: classId, response_id: input.responseId, kind: input.kind, score: input.kind === "explanation_score" ? input.score : null, stance: input.stance, note: cleanText(input.note) ?? "" })
      .select("id")
      .single();
    if (error || !data) fail(error, "Could not save the review.");
    return data.id as string;
  }

  async createAction(teacherId: string, classId: string, input: NewAction) {
    await this.ownClass(teacherId, classId);
    await this.assertLearners(classId, input.learnerIds);
    const { data, error } = await this.db
      .from("teaching_actions")
      .insert({
        class_id: classId, session_id: input.sessionId, check_run_id: input.checkRunId, activity_id: input.activityId,
        recommendation_key: input.recommendationKey, evidence_response_ids: input.evidenceResponseIds, audience: input.audience,
        learner_ids: input.learnerIds, group_id: input.groupId, decision: input.decision, note: cleanText(input.note) ?? "",
      })
      .select("id")
      .single();
    if (error || !data) fail(error, "Could not save the teaching choice.");
    await this.db.from("sessions").update({ state: "teaching" }).eq("id", input.sessionId);
    return data.id as string;
  }

  async updateAction(teacherId: string, actionId: string, patch: ActionPatch) {
    const a = await this.ownedRow(teacherId, "teaching_actions", actionId, "id, class_id, taught_at");
    if (patch.learnerIds) await this.assertLearners(a.class_id as string, patch.learnerIds);
    const update: Row = {};
    if (patch.audience) update.audience = patch.audience;
    if (patch.learnerIds) update.learner_ids = patch.learnerIds;
    if (patch.groupId !== undefined) update.group_id = patch.groupId;
    if (patch.decision) update.decision = patch.decision;
    if (patch.note !== undefined) update.note = cleanText(patch.note) ?? "";
    if (patch.taught !== undefined) update.taught_at = patch.taught ? (a.taught_at ?? new Date().toISOString()) : null;
    if (patch.followUpCheckRunId) update.follow_up_check_run_id = patch.followUpCheckRunId;
    const { error } = await this.db.from("teaching_actions").update(update).eq("id", actionId);
    if (error) fail(error, "Could not update the teaching choice.");
  }
}

export class SupabaseLearnerStore implements LearnerStore {
  constructor(private anon: SupabaseClient) {}

  async exchangeToken(token: string) {
    if (!token.startsWith("c-") || token.length > 80) return null;
    const { data, error } = await this.anon.rpc("learner_exchange", { p_token: token });
    if (error || !data?.[0]) return null;
    return { sessionToken: data[0].session_token as string, expiresAt: data[0].expires_at as string };
  }

  async learnerContext(sessionToken: string): Promise<LearnerContext | null> {
    const { data, error } = await this.anon.rpc("learner_context", { p_session: sessionToken });
    if (error || !data) return null;
    return data as LearnerContext;
  }

  async submit(sessionToken: string, input: { checkRunId: string; submissionId: string; answers: { itemId: string; answerId: string | null; reasonId: string | null; confidence: "sure" | "somewhat_sure" | "unsure" | null; explanation: string | null }[] }) {
    const ctx = await this.learnerContext(sessionToken);
    if (!ctx) throw new StoreError("forbidden", "Your link has expired or was replaced. Ask your teacher for your card.");
    const run = ctx.openRuns.find((r) => r.id === input.checkRunId);
    if (!run) throw new StoreError("closed", "This check is closed. Your teacher has stopped collecting answers.");
    const answers = input.answers.map((a) => ({ ...a, explanation: cleanText(a.explanation, MAX_EXPLANATION) }));
    for (const a of answers) validateAnswer(run.items, a);
    const { data, error } = await this.anon.rpc("learner_submit", {
      p_session: sessionToken,
      p_check_run: input.checkRunId,
      p_submission_id: input.submissionId,
      p_answers: answers,
    });
    if (error) {
      if (error.message.includes("closed")) throw new StoreError("closed", "This check is closed. Your teacher has stopped collecting answers.");
      if (error.message.includes("expired")) throw new StoreError("forbidden", "Your link has expired or was replaced. Ask your teacher for your card.");
      throw new StoreError("unavailable", "Your answers were not saved. Please try again.");
    }
    return data as { saved: number; duplicate: boolean };
  }
}
