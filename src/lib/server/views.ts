import "server-only";
import { notFound } from "next/navigation";
import { getItem, getModule } from "@/lib/content";
import type { Module } from "@/lib/content/schema";
import { tagInfo, CONCEPT_SHORT } from "@/lib/content/interpretations";
import {
  recommend,
  summarizeCheck,
  compareRuns,
  type CheckSummary,
  type Recommendation,
  type ItemLookup,
} from "@/lib/analytics";
import type { CheckRun, ClassBundle, Session } from "@/lib/domain/types";
import type { TeacherContext } from "./context";

export const lookup: ItemLookup = (id, v) => getItem(id, v);

export async function loadClass(t: TeacherContext, classId: string): Promise<ClassBundle> {
  const bundle = await t.store.getClassBundle(t.teacherId, classId);
  if (!bundle) notFound();
  return bundle;
}

export interface SessionView {
  bundle: ClassBundle;
  session: Session;
  module: Module;
  runs: CheckRun[]; // oldest first
}

export async function loadSession(t: TeacherContext, sessionId: string): Promise<SessionView> {
  const classId = await t.store.findClassId(t.teacherId, "session", sessionId);
  if (!classId) notFound();
  const bundle = await loadClass(t, classId);
  const session = bundle.sessions.find((s) => s.id === sessionId);
  if (!session) notFound();
  const runs = bundle.checkRuns.filter((r) => r.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { bundle, session, module: getModule(session.conceptId)!, runs };
}

/** The run a page should focus on: requested, else open, else latest with any evidence, else latest. */
export function pickRun(view: SessionView, requested?: string | null): CheckRun | null {
  if (requested) {
    const r = view.runs.find((x) => x.id === requested);
    if (r) return r;
  }
  const open = [...view.runs].reverse().find((r) => r.state === "open");
  if (open) return open;
  const withEvidence = [...view.runs].reverse().find((r) => view.bundle.responses.some((x) => x.checkRunId === r.id));
  return withEvidence ?? view.runs.at(-1) ?? null;
}

export const PHASE_LABEL: Record<string, string> = { before: "Before check", exit: "Exit check", recheck: "Fresh follow-up check" };
export const MODE_LABEL: Record<string, string> = { digital: "Digital", paper: "Paper", observation_only: "Observation only" };

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function dateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function runLabel(run: CheckRun) {
  return `${PHASE_LABEL[run.phase]} · ${dateLabel(run.openedAt ?? run.createdAt)}`;
}

export interface Insight {
  summary: CheckSummary;
  recs: Recommendation[];
  top: Recommendation | null;
  headline: string;
  sentence: string;
  missing: string | null;
}

export function buildInsight(view: SessionView, run: CheckRun): Insight {
  const summary = summarizeCheck(run, view.bundle.learners, view.bundle.responses, lookup, view.bundle.reviews);
  const recs = recommend(summary, view.module.activity.id);
  const top = recs[0] ?? null;
  const c = summary.complete;
  let headline = view.module.activity.title;
  let sentence = "";
  if (!top) {
    headline = c === 0 ? "No completed checks yet" : view.module.activity.title;
    sentence =
      c === 0
        ? "Once learners finish the check, you will see one suggested teaching move here. The activity is ready to use any time."
        : "Every completed check shows a mixed picture, with no single pattern to act on. Look at the thinking below before choosing a move.";
  } else if (top.kind === "activity") {
    sentence = `${top.count} of ${c} completed checks ${top.count === 1 ? "suggests a student" : "suggest students"} may be ${tagInfo(top.tag!).pattern}.`;
  } else if (top.kind === "calculation") {
    headline = "Check the calculation first";
    sentence = `${top.count} of ${c} completed checks include a calculation slip. Re-count with pre-counted tokens before assuming a ${CONCEPT_SHORT[view.session.conceptId].toLowerCase()} idea.`;
  } else if (top.kind === "gather") {
    headline = "Ask them to explain";
    sentence = `${top.count} of ${c} completed checks include “I am not sure.” Invite explanations to gather more evidence before naming a difficulty.`;
  } else {
    headline = `Stretch: ${view.module.activity.title.toLowerCase()}`;
    sentence = `${top.count} of ${c} completed checks show the expected answer and reason on both questions. Try the extension to stretch their thinking.`;
  }
  const notDone = summary.notStarted + summary.incomplete;
  let missing: string | null = null;
  if (notDone > 0) {
    missing = `${plural(notDone, "student")} ${notDone === 1 ? "has" : "have"} not completed the check`;
    if (summary.incomplete > 0) missing += ` (${summary.incomplete} started but did not finish)`;
    missing += ".";
  }
  return { summary, recs, top, headline, sentence, missing };
}

/** Earlier run in the same class and concept with identical item versions, if any. */
export function comparableEarlierRun(bundle: ClassBundle, run: CheckRun) {
  const candidates = bundle.checkRuns
    .filter((r) => r.id !== run.id && r.conceptId === run.conceptId && r.phase === "before" && r.createdAt < run.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const before of candidates) {
    const c = compareRuns(before, run, bundle.learners, bundle.responses, lookup);
    if (c.comparable) return { before, comparison: c };
  }
  return null;
}
