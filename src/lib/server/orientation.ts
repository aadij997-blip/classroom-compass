import "server-only";
import { createHash } from "node:crypto";
import { getRealTeacher, realMode, type TeacherContext } from "./context";
import { getModule } from "@/lib/content";
import type { ActivityState, OrientationContext, SampleRefs, Underlying } from "@/lib/orientation";
import type { ClassBundle } from "@/lib/domain/types";

function hashKey(mode: string, id: string) {
  return `${mode}-${createHash("sha256").update(`${mode}|${id}`).digest("hex").slice(0, 16)}`;
}

/** Finds the sample liquidity session/check with evidence the walkthrough explains. */
export function resolveSample(bundles: ClassBundle[]): SampleRefs | null {
  for (const b of bundles) {
    const sessions = b.sessions.filter((s) => s.conceptId === "liquidity").sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    for (const s of sessions) {
      const runs = b.checkRuns
        .filter((r) => r.sessionId === s.id && r.phase === "exit" && b.responses.some((x) => x.checkRunId === r.id))
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      const run = runs[0];
      if (!run) continue;
      const activityId = getModule("liquidity")!.activity.id;
      const action = [...b.actions].reverse().find((a) => a.sessionId === s.id && a.activityId === activityId && a.decision !== "dismissed");
      const activityState: ActivityState = !action ? "none" : action.followUpCheckRunId ? "recheck" : action.taughtAt ? "taught" : "planned";
      return { classId: b.class.id, sessionId: s.id, runId: run.id, activityId, activityState };
    }
  }
  return null;
}

export async function buildOrientationContext(t: TeacherContext): Promise<OrientationContext> {
  const isDemo = t.mode === "demo";
  let underlying: Underlying;
  let tourKey: string;
  if (isDemo) {
    const real = await getRealTeacher();
    if (real) {
      const n = (await real.store.listClasses(real.teacherId)).length;
      underlying = n > 0 ? "existing_teacher" : "new_teacher";
      tourKey = hashKey(real.mode, real.teacherId);
    } else {
      underlying = "anonymous";
      tourKey = "anonymous";
    }
  } else {
    const n = (await t.store.listClasses(t.teacherId)).length;
    underlying = n > 0 ? "existing_teacher" : "new_teacher";
    tourKey = hashKey(t.mode, t.teacherId);
  }
  let sample: SampleRefs | null = null;
  if (isDemo) {
    const classes = await t.store.listClasses(t.teacherId);
    const bundles = (await Promise.all(classes.map((c) => t.store.getClassBundle(t.teacherId, c.class.id)))).filter((b): b is ClassBundle => !!b);
    sample = resolveSample(bundles);
  }
  return {
    isDemo,
    // Demo preferences are shared by whoever is behind the sample; real teachers get their own.
    prefKey: isDemo ? `demo-${tourKey}` : tourKey,
    tourKey,
    underlying,
    localMode: realMode === "local",
    sample,
  };
}
