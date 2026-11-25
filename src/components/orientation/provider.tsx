"use client";
// Teacher-only orientation: a route-aware, non-modal five-stop walkthrough of the
// sample class, plus shared preference state for contextual help.
// Tour controls only navigate. They never submit forms or change records.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ORIENTATION,
  FINISH_STEP,
  STEP_IDS,
  activityBody,
  fill,
  finishDestination,
  stepForPath,
  stepRoute,
  stepTarget,
  type OrientationContext,
} from "@/lib/orientation";
import { loadPrefs, loadTour, saveTour, updatePrefs, type Prefs, type TourState } from "@/lib/orientation/storage";
import { leaveDemoTo, startTourAction } from "@/app/actions";
import { SpeechArt } from "@/components/art";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

interface OrientationApi {
  ctx: OrientationContext;
  touring: boolean;
  prefs: Prefs;
  dismissHelp: (id: string) => void;
  restartInSample: () => void;
}

const Ctx = createContext<OrientationApi | null>(null);
export const useOrientation = () => useContext(Ctx);

const TARGET_WAIT_MS = 3500;
const NAV_WAIT_MS = 8000;

export function OrientationProvider({ ctx, children }: { ctx: OrientationContext; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [tour, setTour] = useState<TourState>({ v: "", status: "off", step: 0 });
  const [prefs, setPrefs] = useState<Prefs>({ v: "" });
  const pending = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    setTour(loadTour(ctx.tourKey));
    setPrefs(loadPrefs(ctx.prefKey));
    setMounted(true);
  }, [ctx.tourKey, ctx.prefKey]);

  const commit = useCallback(
    (next: Omit<TourState, "v">) => {
      saveTour(ctx.tourKey, next);
      setTour((t) => ({ ...t, ...next }));
    },
    [ctx.tourKey],
  );

  const go = useCallback(
    (step: number) => {
      const route = stepRoute(step, ctx.sample);
      commit({ status: "touring", step });
      if (route && route.split("?")[0] !== pathname) {
        pending.current = { path: route.split("?")[0], at: Date.now() };
        router.push(route);
      }
    },
    [commit, ctx.sample, pathname, router],
  );

  // Keep the tour in step with where the teacher actually is.
  useEffect(() => {
    if (!mounted || !ctx.isDemo || tour.status !== "touring") return;
    if (!ctx.sample && tour.step > 0) return; // showing the "sample has changed" card in place
    const here = stepForPath(pathname, ctx.sample);
    const expected = Math.min(tour.step, STEP_IDS.length - 1);
    if (pending.current) {
      if (pending.current.path === pathname) pending.current = null;
      else if (Date.now() - pending.current.at < NAV_WAIT_MS) return;
      else pending.current = null;
    }
    if (here === expected) return;
    if (here >= 0) commit({ status: "touring", step: here }); // browser Back/Forward onto another stop
    else commit({ status: "paused", step: tour.step }); // ordinary navigation elsewhere pauses
  }, [pathname, mounted, ctx.isDemo, ctx.sample, tour.status, tour.step, commit]);

  const api = useMemo<OrientationApi>(
    () => ({
      ctx,
      touring: tour.status === "touring" && ctx.isDemo,
      prefs,
      dismissHelp: (id) => {
        updatePrefs(ctx.prefKey, (p) => ({ ...p, help: { ...(p.help ?? {}), [id]: true } }));
        setPrefs(loadPrefs(ctx.prefKey));
      },
      restartInSample: () => go(0),
    }),
    [ctx, tour.status, prefs, go],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && ctx.isDemo && tour.status === "touring" && <TourCard key={tour.step} ctx={ctx} step={tour.step} pathname={pathname} go={go} commit={commit} />}
      {mounted && ctx.isDemo && tour.status === "paused" && (
        <div className="no-print fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lg" role="region" aria-label="Walkthrough paused">
          <span className="text-[14px] font-semibold">Walkthrough paused</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => go(Math.min(tour.step, FINISH_STEP))}>Resume</button>
          <button type="button" className="btn btn-sm btn-secondary !px-2" aria-label="Exit walkthrough" onClick={() => commit({ status: "off", step: 0 })}>
            <X aria-hidden size={16} />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}

function TourCard({
  ctx,
  step,
  pathname,
  go,
  commit,
}: {
  ctx: OrientationContext;
  step: number;
  pathname: string;
  go: (s: number) => void;
  commit: (t: Omit<TourState, "v">) => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);
  // Sit on the side of the screen away from the target so it stays visible.
  const [side, setSide] = useState<"left" | "right">("right");
  const isFinish = step >= FINISH_STEP;
  const stopIdx = Math.min(step, STEP_IDS.length - 1);
  const onRoute = stepForPath(pathname, ctx.sample) === stopIdx;
  const noSample = !ctx.sample && step > 0;

  // Wait (bounded) for the target to mount on the right route, then highlight it.
  useEffect(() => {
    if (!onRoute || noSample) return;
    const selector = `[data-tour="${stepTarget(stopIdx)}"]`;
    let el = document.querySelector<HTMLElement>(selector);
    let obs: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const found = (node: HTMLElement) => {
      setTarget(node);
      setMissing(false);
      node.setAttribute("data-tour-active", "");
      const r = node.getBoundingClientRect();
      setSide(r.left + r.width / 2 > window.innerWidth / 2 && r.width < window.innerWidth * 0.7 ? "left" : "right");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({ block: window.innerWidth < 640 ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
    };
    if (el) found(el);
    else {
      obs = new MutationObserver(() => {
        el = document.querySelector<HTMLElement>(selector);
        if (el) {
          obs?.disconnect();
          if (timer) clearTimeout(timer);
          found(el);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => {
        obs?.disconnect();
        setMissing(true);
      }, TARGET_WAIT_MS);
    }
    return () => {
      obs?.disconnect();
      if (timer) clearTimeout(timer);
      document.querySelectorAll("[data-tour-active]").forEach((n) => n.removeAttribute("data-tour-active"));
    };
  }, [onRoute, stopIdx, noSample, pathname]);

  // Leave room at the bottom of the page so the card never hides content.
  useEffect(() => {
    const node = card.current;
    if (!node) return;
    const apply = () => {
      document.body.style.paddingBottom = `${node.offsetHeight + 24}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(node);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, []);

  // Move focus to the new step's heading (without scrolling) so keyboard users follow along.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const exit = () => commit({ status: "off", step: 0 });
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      commit({ status: "paused", step });
    }
  };

  let title: string;
  let body: React.ReactNode;
  let detail: React.ReactNode = null;
  let primaryLabel = "";

  if (noSample) {
    const c = ORIENTATION.contextual_help.no_sample_evidence;
    title = c.title;
    body = c.body;
  } else if (isFinish) {
    title = ORIENTATION.finish.title;
    body = ORIENTATION.finish.body;
  } else {
    const s = ORIENTATION.tour[stopIdx] as unknown as Record<string, string>;
    title = s.title;
    primaryLabel = s.primary;
    if (s.id === "class-picture") {
      body = fill(s.body, { complete: target?.dataset.complete, eligible: target?.dataset.eligible }) ?? s.fallback_body;
      const labels = ORIENTATION.contextual_help.evidence_labels;
      detail = (
        <details className="mt-2 text-[14px]">
          <summary className="cursor-pointer font-semibold text-forest">{labels.title}</summary>
          <p className="mt-1">{s.optional_definition}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li><strong>Reasoning shown:</strong> {labels.reasoning_shown}</li>
            <li><strong>Worth another look:</strong> {labels.worth_another_look}</li>
            <li><strong>Mixed:</strong> {labels.mixed}</li>
            <li><strong>Unsure:</strong> {labels.unsure}</li>
            <li><strong>Missing:</strong> {labels.missing}</li>
          </ul>
        </details>
      );
    } else if (s.id === "activity") {
      body = activityBody(ctx.sample?.activityState ?? "none");
    } else {
      body = s.body;
    }
    if (s.tip) detail = <p className="mt-2 rounded-xl bg-pale px-3 py-2 text-[14px] text-forest">{s.tip}</p>;
  }

  return (
    <div
      ref={card}
      role="region"
      aria-label="Walkthrough"
      onKeyDown={onKeyDown}
      className={`no-print fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto rounded-t-[22px] border border-line bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:w-[400px] sm:rounded-[22px] ${side === "left" ? "sm:left-5" : "sm:right-5"}`}
    >
      <p className="sr-only" aria-live="polite">
        {isFinish ? title : `Step ${stopIdx + 1} of ${STEP_IDS.length}: ${title}`}
      </p>
      <div className="flex items-start justify-between gap-3">
        <span className="cue cue-green !text-[13px]">{isFinish ? "Walkthrough done" : noSample ? "Sample walkthrough" : `Step ${stopIdx + 1} of ${STEP_IDS.length}`}</span>
        <button type="button" onClick={exit} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[14px] font-semibold text-muted hover:bg-neutral hover:text-ink">
          <X aria-hidden size={16} /> Exit tour
        </button>
      </div>
      <div className="mt-2 flex gap-3">
        <div className="min-w-0 flex-1">
          <h2 ref={heading} tabIndex={-1} className="text-[19px] font-bold leading-snug outline-none">{title}</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed">{body}</p>
          {onRoute && missing && !noSample && !isFinish && (
            <p className="mt-2 rounded-xl bg-amber px-3 py-2 text-[14px] text-amber-ink">This part of the page isn’t showing right now. You can still continue the walkthrough.</p>
          )}
          {!onRoute && !noSample && !isFinish && <p className="mt-2 text-[14px] text-muted">Opening the page…</p>}
          {detail}
        </div>
        <SpeechArt className="hidden w-[56px] flex-none sm:block" />
      </div>

      {isFinish && (
        <>
          <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]" aria-label="The loop">
            {["Collect thinking", "Choose a teaching move", "Check again"].map((t, i) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className={`cue ${i === 1 ? "cue-blush" : "cue-green"} !text-[13px]`}>{t}</span>
                {i < 2 && <span aria-hidden>→</span>}
              </li>
            ))}
          </ol>
          {ctx.localMode && ctx.underlying !== "anonymous" && (
            <details className="mt-3 text-[14px] text-muted">
              <summary className="cursor-pointer">{ORIENTATION.finish.local_note}</summary>
              <a className="link" href="https://github.com/aadij997-blip/classroom-compass#configured-classroom-mode-supabase" target="_blank" rel="noreferrer">
                {ORIENTATION.finish.local_help_label}
              </a>
            </details>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={leaveDemoTo} onSubmit={() => commit({ status: "finished", step: FINISH_STEP })}>
              <input type="hidden" name="dest" value={finishDestination(ctx.underlying)} />
              <button className="btn btn-primary">
                {ctx.underlying === "anonymous"
                  ? ORIENTATION.finish.primary_anonymous
                  : ctx.underlying === "new_teacher"
                    ? ORIENTATION.finish.primary_new_teacher
                    : ORIENTATION.finish.primary_existing_teacher}
              </button>
            </form>
            <button type="button" className="btn btn-secondary" onClick={() => commit({ status: "finished", step: FINISH_STEP })}>
              {ORIENTATION.finish.secondary}
            </button>
          </div>
          <p className="mt-3 text-[13px] text-muted">{ORIENTATION.finish.later_help}</p>
        </>
      )}

      {noSample && (
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={startTourAction} onSubmit={() => saveTour(ctx.tourKey, { status: "touring", step: 0 })}>
            <input type="hidden" name="fresh" value="1" />
            <button className="btn btn-primary">Start a fresh sample walkthrough</button>
          </form>
          <button type="button" className="btn btn-secondary" onClick={exit}>Keep exploring</button>
        </div>
      )}

      {!isFinish && !noSample && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft aria-hidden size={16} /> Back
          </button>
          <button type="button" className="btn btn-primary" onClick={() => (ctx.sample ? go(step + 1) : commit({ status: "touring", step: 1 }))}>
            {primaryLabel} <ArrowRight aria-hidden size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
