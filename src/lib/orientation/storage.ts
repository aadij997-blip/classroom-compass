// Minimal, failure-tolerant preference storage for orientation.
// Stores only version/status/step/dismissals — never credentials, tokens,
// learner answers, or assessment keys. Falls back to memory if storage is blocked.

import { ORIENTATION_VERSION, FINISH_STEP } from "./index";

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* storage blocked */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: memory copy keeps this tab working */
  }
}

export type TourStatus = "off" | "touring" | "paused" | "finished";
export interface TourState {
  v: string;
  status: TourStatus;
  step: number;
}

export interface Prefs {
  v: string;
  welcome?: "seen";
  checklistHidden?: boolean;
  help?: Record<string, true>;
}

const tourKeyFor = (k: string) => `cc-orient:${ORIENTATION_VERSION}:tour:${k}`;
const prefKeyFor = (k: string) => `cc-orient:${ORIENTATION_VERSION}:prefs:${k}`;

export function loadTour(key: string): TourState {
  const off: TourState = { v: ORIENTATION_VERSION, status: "off", step: 0 };
  const raw = read(tourKeyFor(key));
  if (!raw) return off;
  try {
    const t = JSON.parse(raw) as TourState;
    if (t.v !== ORIENTATION_VERSION || !["off", "touring", "paused", "finished"].includes(t.status)) return off;
    const step = Number.isInteger(t.step) ? Math.max(0, Math.min(FINISH_STEP, t.step)) : 0;
    return { v: t.v, status: t.status, step };
  } catch {
    return off;
  }
}

export function saveTour(key: string, t: Omit<TourState, "v">) {
  write(tourKeyFor(key), JSON.stringify({ v: ORIENTATION_VERSION, status: t.status, step: t.step }));
}

export function loadPrefs(key: string): Prefs {
  const raw = read(prefKeyFor(key));
  if (!raw) return { v: ORIENTATION_VERSION };
  try {
    const p = JSON.parse(raw) as Prefs;
    if (p.v !== ORIENTATION_VERSION) return { v: ORIENTATION_VERSION };
    return {
      v: p.v,
      welcome: p.welcome === "seen" ? "seen" : undefined,
      checklistHidden: p.checklistHidden === true,
      help: p.help && typeof p.help === "object" ? Object.fromEntries(Object.keys(p.help).slice(0, 50).map((k) => [k, true as const])) : {},
    };
  } catch {
    return { v: ORIENTATION_VERSION };
  }
}

export function updatePrefs(key: string, patch: (p: Prefs) => Prefs) {
  write(prefKeyFor(key), JSON.stringify(patch(loadPrefs(key))));
}
