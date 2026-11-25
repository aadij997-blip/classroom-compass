"use client";
// One-time welcome for a teacher's first arrival with no classes. Native <dialog>
// gives focus containment, Escape, and focus return. Every close is remembered.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ORIENTATION } from "@/lib/orientation";
import { loadPrefs, updatePrefs } from "@/lib/orientation/storage";
import { useOrientation } from "./provider";
import { StartTourButton } from "./start-tour";
import { ChecklistArt } from "@/components/art";

export function WelcomeDialog() {
  const o = useOrientation();
  const ref = useRef<HTMLDialogElement>(null);
  const prefKey = o?.ctx.prefKey;

  useEffect(() => {
    if (!prefKey || o?.ctx.isDemo) return;
    if (loadPrefs(prefKey).welcome === "seen") return;
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, [prefKey, o?.ctx.isDemo]);

  const markSeen = () => {
    if (prefKey) updatePrefs(prefKey, (p) => ({ ...p, welcome: "seen" }));
  };
  const w = ORIENTATION.welcome;

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      aria-describedby="welcome-body"
      onClose={markSeen}
      className="no-print m-auto w-[min(560px,calc(100vw-32px))] rounded-[24px] border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-ink/30"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <p className="eyebrow">{w.eyebrow}</p>
          <ChecklistArt className="hidden w-[72px] flex-none sm:block" />
        </div>
        <h2 id="welcome-title" className="mt-1 text-[26px] font-bold">{w.title}</h2>
        <p id="welcome-body" className="mt-2 text-[16px]">{w.body}</p>
        <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[14px]" aria-label="The loop">
          {w.loop.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={`cue ${i % 2 ? "cue-blush" : "cue-green"}`}>{s}</span>
              {i < w.loop.length - 1 && <span aria-hidden>→</span>}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span onClick={markSeen}>
            <StartTourButton className="btn btn-primary w-full sm:w-auto">{w.primary}</StartTourButton>
          </span>
          <Link href="/classes/new" className="btn btn-secondary" onClick={() => { markSeen(); ref.current?.close(); }}>{w.secondary}</Link>
          <button type="button" className="btn btn-secondary !border-transparent !bg-transparent underline" onClick={() => ref.current?.close()}>
            {w.dismiss}
          </button>
        </div>
        <p className="mt-4 text-[13px] text-muted">{w.time_note} {w.sample_note}</p>
      </div>
    </dialog>
  );
}
