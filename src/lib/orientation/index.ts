// Teacher orientation: central copy, step routing, and pure helpers.
// No assessment keys, learner responses, or tokens ever pass through here.

import copyJson from "../../../content/orientation-copy.json";

export const ORIENTATION = copyJson;
export const ORIENTATION_VERSION = copyJson.version;

export type StepId = "today" | "class-picture" | "thinking" | "activity" | "setup";
export const STEP_IDS: StepId[] = ["today", "class-picture", "thinking", "activity", "setup"];
/** Index STEP_IDS.length is the finish card. */
export const FINISH_STEP = STEP_IDS.length;

export type ActivityState = "none" | "planned" | "taught" | "recheck";

/** Authorized sample references, resolved on the server from the demo store. */
export interface SampleRefs {
  classId: string;
  sessionId: string;
  runId: string;
  activityId: string;
  activityState: ActivityState;
}

/** Who is behind the sample walkthrough (drives the finish choices). */
export type Underlying = "anonymous" | "new_teacher" | "existing_teacher";

export interface OrientationContext {
  isDemo: boolean;
  /** Stable per-teacher, per-mode key for local preferences (hashed; never a raw ID). */
  prefKey: string;
  /** Key for the tour state: the real person behind the sample. */
  tourKey: string;
  underlying: Underlying;
  localMode: boolean;
  sample: SampleRefs | null;
}

export function stepRoute(step: number, s: SampleRefs | null): string | null {
  const id = STEP_IDS[Math.min(step, STEP_IDS.length - 1)];
  if (id === "today") return "/today";
  if (!s) return null;
  const e = encodeURIComponent;
  switch (id) {
    case "class-picture":
      return `/sessions/${e(s.sessionId)}/teach?run=${e(s.runId)}`;
    case "thinking":
      return `/sessions/${e(s.sessionId)}/thinking?run=${e(s.runId)}`;
    case "activity":
      return `/teaching-ideas/${e(s.activityId)}?session=${e(s.sessionId)}&run=${e(s.runId)}`;
    case "setup":
      return `/sessions/new?classId=${e(s.classId)}&concept=liquidity`;
  }
  return null;
}

/** Which tour step (if any) a pathname belongs to. Query strings are ignored. */
export function stepForPath(pathname: string, s: SampleRefs | null): number {
  if (pathname === "/today") return 0;
  if (!s) return -1;
  for (let i = 1; i < STEP_IDS.length; i++) {
    const r = stepRoute(i, s);
    if (r && r.split("?")[0] === pathname) return i;
  }
  return -1;
}

export function stepTarget(step: number): string {
  return ORIENTATION.tour[Math.min(step, STEP_IDS.length - 1)].target;
}

export function fill(template: string, values: Record<string, string | number | undefined>): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    if (v === undefined || v === "") {
      missing = true;
      return "";
    }
    return String(v);
  });
  return missing ? null : out;
}

/** Copy for the activity stop, adapted to the sample's actual state. */
export function activityBody(state: ActivityState): string {
  const a = ORIENTATION.tour[3] as { body: string; planned_variant: string; taught_variant: string };
  if (state === "planned") return a.planned_variant;
  if (state === "taught" || state === "recheck") return a.taught_variant;
  return a.body;
}

const SAFE_DESTINATIONS = new Set(["/", "/?signup=1", "/today", "/classes", "/classes/new"]);

/** Only a fixed allowlist of internal destinations; never arbitrary or learner-link URLs. */
export function sanitizeDestination(dest: unknown): string {
  return typeof dest === "string" && SAFE_DESTINATIONS.has(dest) ? dest : "/today";
}

export function finishDestination(u: Underlying): string {
  return u === "anonymous" ? "/?signup=1" : u === "new_teacher" ? "/classes/new" : "/classes";
}

// ------------------------------------------------------------------ checklist

export interface ChecklistInput {
  classes: { id: string; learnerCount: number; lastActivityAt: string }[];
  /** For the selected (most recent) class. */
  sessionCount: number;
  evidenceCount: number; // saved responses + observations in that class's sessions
}

export interface ChecklistState {
  items: { id: "class" | "session" | "evidence"; done: boolean }[];
  allDone: boolean;
}

export function deriveChecklist(input: ChecklistInput): ChecklistState {
  const hasClass = input.classes.some((c) => c.learnerCount > 0);
  const items = [
    { id: "class" as const, done: hasClass },
    { id: "session" as const, done: hasClass && input.sessionCount > 0 },
    { id: "evidence" as const, done: hasClass && input.sessionCount > 0 && input.evidenceCount > 0 },
  ];
  return { items, allDone: items.every((i) => i.done) };
}
