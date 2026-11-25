"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import {
  DEMO_COOKIE,
  clientIp,
  getTeacher,
  localSignIn,
  localSignUp,
  demoWorkspaceExists,
  newDemoWorkspace,
  requireTeacher,
  secureCookies,
  seedDemo,
  signOutEverywhere,
  supabaseConfigured,
  supabaseServer,
} from "@/lib/server/context";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { StoreError, type PaperEntry } from "@/lib/store/types";
import { getActivity, getModule, itemRefsFor } from "@/lib/content";
import { CONCEPT_IDS, MODES, PHASES, type IssuedToken } from "@/lib/domain/types";
import type { ActionResult } from "@/components/forms";
import { sanitizeDestination } from "@/lib/orientation";

function failure(e: unknown): ActionResult {
  if (e instanceof StoreError) return { ok: false, message: e.message };
  if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Please check the form." };
  // Do not log request bodies: they can contain learner text.
  console.error("action failed:", e instanceof Error ? e.name : "unknown");
  return { ok: false, message: "That did not save. Please try again." };
}

const ok = (message?: string): ActionResult => ({ ok: true, message, at: Date.now() });

// ------------------------------------------------------------------- demo
export async function startDemo() {
  const ws = newDemoWorkspace();
  (await cookies()).set(DEMO_COOKIE, ws, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", maxAge: 60 * 60 * 24 });
  redirect("/today");
}

export async function resetDemo() {
  const ws = (await cookies()).get(DEMO_COOKIE)?.value;
  if (ws) seedDemo(ws);
  revalidatePath("/", "layout");
  redirect("/today?reset=1");
}

export async function leaveDemo() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/");
}

/**
 * Enters the sample class for the walkthrough. Reuses the current sample if one
 * exists (never resets it); creates a fresh one only when none exists or the
 * teacher explicitly asked for a fresh sample. Teacher sign-in is untouched.
 */
export async function startTourAction(fd: FormData) {
  const jar = await cookies();
  const ws = jar.get(DEMO_COOKIE)?.value;
  const fresh = fd.get("fresh") === "1";
  if (!ws || fresh || !demoWorkspaceExists(ws)) {
    jar.set(DEMO_COOKIE, newDemoWorkspace(), { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", maxAge: 60 * 60 * 24 });
  }
  redirect("/today");
}

/** Leaves the sample (only the sample cookie) and goes to an allowlisted page. */
export async function leaveDemoTo(fd: FormData) {
  (await cookies()).delete(DEMO_COOKIE);
  redirect(sanitizeDestination(fd.get("dest")));
}

// ------------------------------------------------------------------- auth
const Credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z.string().min(10, "Use at least 10 characters for your password.").max(200),
  displayName: z.string().trim().max(60).optional(),
});

export async function signInAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!allow(`auth:${await clientIp()}`, LIMITS.authPerIp.limit, LIMITS.authPerIp.windowMs)) return { ok: false, message: "Too many attempts. Wait a few minutes and try again." };
  const mode = fd.get("intent") === "signup" ? "signup" : "signin";
  const parsed = Credentials.safeParse({ email: fd.get("email"), password: fd.get("password"), displayName: fd.get("displayName") || undefined });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { email, password, displayName } = parsed.data;
  (await cookies()).delete(DEMO_COOKIE);
  if (supabaseConfigured) {
    const sb = await supabaseServer();
    const res =
      mode === "signup"
        ? await sb.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split("@")[0] } } })
        : await sb.auth.signInWithPassword({ email, password });
    if (res.error) return { ok: false, message: mode === "signup" ? "We could not create that account." : "That email and password do not match." };
    if (mode === "signup" && !res.data.session) return { ok: true, message: "Check your email to confirm your account, then sign in." };
  } else {
    const res = mode === "signup" ? await localSignUp(email, password, displayName || email.split("@")[0]) : await localSignIn(email, password);
    if ("error" in res) return { ok: false, message: res.error };
  }
  redirect("/today");
}

export async function signOutAction() {
  await signOutEverywhere();
  redirect("/");
}

// ------------------------------------------------------------------- cards
export interface Card {
  learnerId: string;
  alias: string;
  url: string;
  qrSvg: string;
}
export type CardsResult = (ActionResult & { cards?: Card[]; classId?: string }) | null;

async function toCards(tokens: IssuedToken[]): Promise<Card[]> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return Promise.all(
    tokens.map(async (t) => {
      const url = `${proto}://${host}/s/${t.token}`;
      const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1f14", light: "#ffffff" } });
      return { learnerId: t.learnerId, alias: t.alias, url, qrSvg };
    }),
  );
}

const NewClass = z.object({
  title: z.string().trim().min(1, "Give the class a name.").max(80),
  gradeBand: z.enum(["4–6", "4", "5", "6"]),
  learnerCount: z.coerce.number().int().min(1, "Add at least one learner.").max(60, "Up to 60 learners per class."),
});

export async function createClassAction(_: CardsResult, fd: FormData): Promise<CardsResult> {
  try {
    const t = await requireTeacher();
    const input = NewClass.parse({ title: fd.get("title"), gradeBand: fd.get("gradeBand") ?? "4–6", learnerCount: fd.get("learnerCount") });
    const { classId, tokens } = await t.store.createClass(t.teacherId, input);
    revalidatePath("/", "layout");
    return { ok: true, message: "Class saved", classId, cards: await toCards(tokens), at: Date.now() };
  } catch (e) {
    return failure(e);
  }
}

export async function issueCardsAction(_: CardsResult, fd: FormData): Promise<CardsResult> {
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    const bundle = await t.store.getClassBundle(t.teacherId, classId);
    if (!bundle) return { ok: false, message: "Class not found." };
    const which = fd.getAll("learnerId").map(String);
    const ids = which.length ? which : bundle.learners.map((l) => l.id);
    const tokens = await t.store.issueTokens(t.teacherId, classId, ids);
    revalidatePath(`/classes/${classId}`, "layout");
    return { ok: true, message: `New cards ready for ${tokens.length} learner${tokens.length === 1 ? "" : "s"}`, cards: await toCards(tokens), at: Date.now() };
  } catch (e) {
    return failure(e);
  }
}

export async function addLearnersAction(_: CardsResult, fd: FormData): Promise<CardsResult> {
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    const count = z.coerce.number().int().min(1).max(20).parse(fd.get("count"));
    const tokens = await t.store.addLearners(t.teacherId, classId, count);
    revalidatePath(`/classes/${classId}`, "layout");
    return { ok: true, message: `Added ${tokens.length}`, cards: await toCards(tokens), at: Date.now() };
  } catch (e) {
    return failure(e);
  }
}

export async function revokeCardAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    await t.store.revokeLearner(t.teacherId, classId, z.string().parse(fd.get("learnerId")));
    revalidatePath(`/classes/${classId}`, "layout");
    return ok("Card turned off");
  } catch (e) {
    return failure(e);
  }
}

// ------------------------------------------------------------------ groups
export async function saveGroupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    await t.store.saveGroup(t.teacherId, classId, {
      id: (fd.get("groupId") as string) || undefined,
      label: z.string().trim().min(1, "Give the group a label.").max(40).parse(fd.get("label")),
      learnerIds: fd.getAll("learnerId").map(String),
    });
    revalidatePath(`/classes/${classId}`, "layout");
    return ok();
  } catch (e) {
    return failure(e);
  }
}

export async function deleteGroupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    await t.store.deleteGroup(t.teacherId, classId, z.string().parse(fd.get("groupId")));
    revalidatePath(`/classes/${classId}`, "layout");
    return ok("Group removed");
  } catch (e) {
    return failure(e);
  }
}

export async function deleteClassAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  try {
    const t = await requireTeacher();
    const classId = z.string().parse(fd.get("classId"));
    const bundle = await t.store.getClassBundle(t.teacherId, classId);
    if (!bundle) return { ok: false, message: "Class not found." };
    if (String(fd.get("confirm") ?? "").trim() !== bundle.class.title) {
      return { ok: false, message: "Type the class name exactly to confirm." };
    }
    await t.store.deleteClass(t.teacherId, classId);
    revalidatePath("/", "layout");
    done = true;
  } catch (e) {
    return failure(e);
  }
  if (done) redirect("/classes?deleted=1");
  return null;
}

// ---------------------------------------------------------------- sessions
const NewSession = z.object({
  classId: z.string().min(1, "Choose a class."),
  conceptId: z.enum(CONCEPT_IDS),
  mode: z.enum(MODES),
  phase: z.enum(PHASES),
});

export async function createSessionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target = "";
  try {
    const t = await requireTeacher();
    const input = NewSession.parse({ classId: fd.get("classId"), conceptId: fd.get("conceptId"), mode: fd.get("mode"), phase: fd.get("phase") ?? "exit" });
    const module = getModule(input.conceptId)!;
    const checked = input.mode !== "observation_only";
    const { sessionId } = await t.store.createSession(t.teacherId, {
      classId: input.classId,
      conceptId: input.conceptId,
      goal: module.goal,
      mode: input.mode,
      phase: checked ? input.phase : null,
      items: checked ? itemRefsFor(input.conceptId, input.phase) : null,
    });
    revalidatePath("/", "layout");
    target = `/sessions/${sessionId}/collect`;
  } catch (e) {
    return failure(e);
  }
  redirect(target);
}

export async function setRunStateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const runId = z.string().parse(fd.get("runId"));
    const state = z.enum(["open", "closed"]).parse(fd.get("state"));
    await t.store.setCheckRunState(t.teacherId, runId, state);
    revalidatePath("/", "layout");
    return ok(state === "open" ? "Check is open" : "Check is closed");
  } catch (e) {
    return failure(e);
  }
}

export async function moveToTeachAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target = "";
  try {
    const t = await requireTeacher();
    const sessionId = z.string().parse(fd.get("sessionId"));
    const runId = fd.get("runId");
    if (typeof runId === "string" && runId) await t.store.setCheckRunState(t.teacherId, runId, "closed");
    await t.store.setSessionState(t.teacherId, sessionId, "teaching");
    revalidatePath("/", "layout");
    target = `/sessions/${sessionId}/teach`;
  } catch (e) {
    return failure(e);
  }
  redirect(target);
}

const PaperEntrySchema = z.object({
  learnerId: z.string().min(1),
  itemId: z.string().min(1),
  answerId: z.string().nullable(),
  reasonId: z.string().nullable(),
  clear: z.boolean().optional(),
});

/** Called directly from the paper entry grid. */
export async function savePaperAction(checkRunId: string, entries: PaperEntry[]): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const parsed = z.array(PaperEntrySchema).max(200).parse(entries);
    const res = await t.store.savePaperEntries(t.teacherId, z.string().parse(checkRunId), parsed);
    revalidatePath("/", "layout");
    return ok(res.changed ? "Saved" : "Saved — no changes");
  } catch (e) {
    return failure(e);
  }
}

// ----------------------------------------------------------- observations
const NewObservation = z.object({
  classId: z.string(),
  sessionId: z.string().optional(),
  conceptId: z.enum(CONCEPT_IDS),
  scope: z.enum(["individual", "group", "class"]),
  learnerId: z.string().optional(),
  groupId: z.string().optional(),
  category: z.string().min(1, "Choose what you noticed.").max(60),
  note: z.string().max(600).default(""),
  tally: z.coerce.number().int().min(0).optional(),
  denominator: z.coerce.number().int().min(1).optional(),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
});

export async function addObservationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const blank = (k: string) => (fd.get(k) === "" || fd.get(k) === null ? undefined : fd.get(k));
    const input = NewObservation.parse({
      classId: fd.get("classId"),
      sessionId: blank("sessionId"),
      conceptId: fd.get("conceptId"),
      scope: fd.get("scope"),
      learnerId: blank("learnerId"),
      groupId: blank("groupId"),
      category: fd.get("category"),
      note: fd.get("note") ?? "",
      tally: blank("tally"),
      denominator: blank("denominator"),
      observedOn: fd.get("observedOn"),
    });
    const supports = fd.getAll("supports").map(String).filter(Boolean).join("; ") || null;
    await t.store.addObservation(t.teacherId, input.classId, {
      sessionId: input.sessionId ?? null,
      conceptId: input.conceptId,
      scope: input.scope,
      learnerId: input.scope === "individual" ? (input.learnerId ?? null) : null,
      groupId: input.scope === "group" ? (input.groupId ?? null) : null,
      category: input.category,
      supports,
      note: input.note,
      tally: input.scope === "individual" ? null : (input.tally ?? null),
      denominator: input.scope === "individual" ? null : (input.denominator ?? null),
      observedOn: input.observedOn,
    });
    revalidatePath("/", "layout");
    return ok("Observation saved");
  } catch (e) {
    return failure(e);
  }
}

// ---------------------------------------------------------------- reviews
export async function addReviewAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const kind = z.enum(["explanation_score", "interpretation_note"]).parse(fd.get("kind"));
    const scoreRaw = fd.get("score");
    await t.store.addReview(t.teacherId, z.string().parse(fd.get("classId")), {
      responseId: z.string().parse(fd.get("responseId")),
      kind,
      score: kind === "explanation_score" ? (z.coerce.number().int().min(0).max(2).parse(scoreRaw) as 0 | 1 | 2) : null,
      stance: kind === "interpretation_note" ? z.enum(["agree", "disagree", "context"]).parse(fd.get("stance")) : null,
      note: z.string().max(600).parse(fd.get("note") ?? ""),
    });
    revalidatePath("/", "layout");
    return ok(kind === "explanation_score" ? "Review saved" : "Note saved");
  } catch (e) {
    return failure(e);
  }
}

// ----------------------------------------------------------- teaching moves
const Audience = z.enum(["whole_class", "small_group", "individual"]);

export async function decideActionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const sessionId = z.string().parse(fd.get("sessionId"));
    const classId = await t.store.findClassId(t.teacherId, "session", sessionId);
    if (!classId) return { ok: false, message: "Session not found." };
    const activityId = z.string().parse(fd.get("activityId"));
    if (!getActivity(activityId)) return { ok: false, message: "Unknown activity." };
    const decision = z.enum(["accepted", "dismissed"]).parse(fd.get("decision"));
    const audience = Audience.parse(fd.get("audience") ?? "whole_class");
    const groupId = audience === "small_group" ? ((fd.get("groupId") as string) || null) : null;
    const learnerIds = audience === "individual" ? fd.getAll("learnerId").map(String) : [];
    if (decision === "accepted" && audience === "individual" && learnerIds.length === 0) return { ok: false, message: "Choose at least one learner, or teach the whole class." };
    if (decision === "accepted" && audience === "small_group" && !groupId) return { ok: false, message: "Choose a group, or add one from the class page." };
    const evidence = String(fd.get("evidence") ?? "").split(",").filter(Boolean).slice(0, 400);
    await t.store.createAction(t.teacherId, classId, {
      sessionId,
      checkRunId: (fd.get("runId") as string) || null,
      activityId,
      recommendationKey: String(fd.get("recKey") ?? "teacher-choice").slice(0, 80),
      evidenceResponseIds: evidence,
      audience,
      learnerIds,
      groupId,
      decision,
      note: String(fd.get("note") ?? ""),
    });
    revalidatePath("/", "layout");
    return ok(decision === "accepted" ? "Saved — ready to teach" : "Suggestion dismissed");
  } catch (e) {
    return failure(e);
  }
}

export async function markTaughtAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const t = await requireTeacher();
    const taught = fd.get("taught") !== "false";
    await t.store.updateAction(t.teacherId, z.string().parse(fd.get("actionId")), { taught, decision: "accepted" });
    revalidatePath("/", "layout");
    return ok(taught ? "Marked as taught" : "Marked as not yet taught");
  } catch (e) {
    return failure(e);
  }
}

export async function checkAgainAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target = "";
  try {
    const t = await requireTeacher();
    const sessionId = z.string().parse(fd.get("sessionId"));
    const classId = await t.store.findClassId(t.teacherId, "session", sessionId);
    if (!classId) return { ok: false, message: "Session not found." };
    const bundle = (await t.store.getClassBundle(t.teacherId, classId))!;
    const session = bundle.sessions.find((s) => s.id === sessionId)!;
    const kind = z.enum(["fresh", "same"]).parse(fd.get("kind") ?? "fresh");
    const actionId = (fd.get("actionId") as string) || null;
    const phase = kind === "fresh" ? "recheck" : "exit";
    const runId = await t.store.createCheckRun(t.teacherId, { sessionId, phase, items: itemRefsFor(session.conceptId, phase), followUpOfActionId: actionId });
    revalidatePath("/", "layout");
    target = `/sessions/${sessionId}/collect?run=${runId}`;
  } catch (e) {
    return failure(e);
  }
  redirect(target);
}

export async function whoAmI() {
  const t = await getTeacher();
  return t ? { mode: t.mode, name: t.displayName } : null;
}
