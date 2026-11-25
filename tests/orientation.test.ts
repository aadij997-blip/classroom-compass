import { describe, expect, it } from "vitest";
import {
  ORIENTATION,
  STEP_IDS,
  activityBody,
  deriveChecklist,
  fill,
  finishDestination,
  sanitizeDestination,
  stepForPath,
  stepRoute,
  type SampleRefs,
} from "@/lib/orientation";
import { resolveSample } from "@/lib/server/orientation";
import { fixtureBundle } from "@/lib/demo/fixture";

const sample: SampleRefs = { classId: "w.demo-class", sessionId: "w.session-liquidity", runId: "w.liq-exit", activityId: "activity-cash-today", activityState: "planned" };

describe("copy", () => {
  it("has five stops with targets and one central version", () => {
    expect(ORIENTATION.tour.map((s) => s.id)).toEqual(STEP_IDS);
    expect(ORIENTATION.version).toBe("teacher-orientation-v1");
    for (const s of ORIENTATION.tour) expect(s.target).toBeTruthy();
  });
  it("keeps every stop within a readable length", () => {
    for (const s of ORIENTATION.tour) expect(s.body.split(/\s+/).length).toBeLessThanOrEqual(65);
  });
});

describe("routing", () => {
  it("builds every stop's route from authorized sample IDs and maps paths back", () => {
    for (let i = 0; i < STEP_IDS.length; i++) {
      const r = stepRoute(i, sample)!;
      expect(stepForPath(r.split("?")[0], sample)).toBe(i);
    }
    expect(stepRoute(1, sample)).toBe("/sessions/w.session-liquidity/teach?run=w.liq-exit");
  });
  it("finish shares the setup page", () => {
    expect(stepRoute(STEP_IDS.length, sample)).toBe(stepRoute(STEP_IDS.length - 1, sample));
  });
  it("has no routes beyond Today when the sample is missing", () => {
    expect(stepRoute(0, null)).toBe("/today");
    expect(stepRoute(2, null)).toBeNull();
    expect(stepForPath("/sessions/x/teach", null)).toBe(-1);
  });
  it("treats unrelated pages as off-tour", () => {
    expect(stepForPath("/classes", sample)).toBe(-1);
    expect(stepForPath("/check", sample)).toBe(-1);
  });
});

describe("safe destinations", () => {
  it("allows only fixed internal pages", () => {
    expect(sanitizeDestination("/classes/new")).toBe("/classes/new");
    expect(sanitizeDestination("/?signup=1")).toBe("/?signup=1");
    for (const bad of ["https://evil.example", "//evil.example", "/s/c-token", "/check", "javascript:alert(1)", null, 3]) {
      expect(sanitizeDestination(bad)).toBe("/today");
    }
  });
  it("sends each kind of person to the right place", () => {
    expect(finishDestination("anonymous")).toBe("/?signup=1");
    expect(finishDestination("new_teacher")).toBe("/classes/new");
    expect(finishDestination("existing_teacher")).toBe("/classes");
  });
});

describe("copy filling", () => {
  it("fills counts from the view model and falls back when absent", () => {
    const body = ORIENTATION.tour[1].body;
    expect(fill(body, { complete: 21, eligible: 24 })).toMatch(/^21 of 24 learners/);
    expect(fill(body, { complete: undefined, eligible: 24 })).toBeNull();
  });
  it("adapts the activity stop to its real state and never promises the tour will act", () => {
    expect(activityBody("planned")).toMatch(/will not mark it taught/);
    expect(activityBody("taught")).toMatch(/will not launch/);
    expect(activityBody("recheck")).toMatch(/will not launch/);
    expect(activityBody("none")).toBe(ORIENTATION.tour[3].body);
  });
});

describe("first-session checklist", () => {
  const cls = (n: number) => [{ id: "c", learnerCount: n, lastActivityAt: "" }];
  it("derives completion only from records", () => {
    expect(deriveChecklist({ classes: [], sessionCount: 0, evidenceCount: 0 }).items.map((i) => i.done)).toEqual([false, false, false]);
    expect(deriveChecklist({ classes: cls(0), sessionCount: 1, evidenceCount: 1 }).items.map((i) => i.done)).toEqual([false, false, false]);
    expect(deriveChecklist({ classes: cls(24), sessionCount: 0, evidenceCount: 0 }).items.map((i) => i.done)).toEqual([true, false, false]);
    expect(deriveChecklist({ classes: cls(24), sessionCount: 1, evidenceCount: 0 }).items.map((i) => i.done)).toEqual([true, true, false]);
    expect(deriveChecklist({ classes: cls(24), sessionCount: 1, evidenceCount: 1 }).allDone).toBe(true);
  });
});

describe("sample resolution", () => {
  it("finds the sample liquidity session, exit check, and planned activity without hardcoded IDs", () => {
    const b = fixtureBundle("ws.", "demo:ws");
    const s = resolveSample([b])!;
    expect(s.sessionId).toBe("ws.session-liquidity");
    expect(s.runId).toBe("ws.liq-exit");
    expect(s.activityId).toBe("activity-cash-today");
    expect(s.activityState).toBe("planned");
  });
  it("reflects a taught or rechecked activity", () => {
    const b = fixtureBundle("ws.", "demo:ws");
    b.actions[0].taughtAt = "2026-11-24T18:00:00Z";
    expect(resolveSample([b])!.activityState).toBe("taught");
    b.actions[0].followUpCheckRunId = "x";
    expect(resolveSample([b])!.activityState).toBe("recheck");
  });
  it("returns null when the usual example is gone", () => {
    const b = fixtureBundle("ws.", "demo:ws");
    b.responses = b.responses.filter((r) => !r.checkRunId.endsWith("liq-exit"));
    expect(resolveSample([b])).toBeNull();
    expect(resolveSample([])).toBeNull();
  });
});
