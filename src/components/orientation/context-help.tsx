"use client";
// Short contextual help. With `auto`, it opens once in its context (per teacher
// and browser) with a "Got it" button; afterwards — and during the walkthrough —
// it stays available as a collapsed "What does this mean?" detail.

import { useOrientation } from "./provider";
import { Lightbulb } from "lucide-react";

export function ContextHelp({ id, title, children, auto = false, className = "" }: { id: string; title: string; children: React.ReactNode; auto?: boolean; className?: string }) {
  const o = useOrientation();
  const seen = !!o?.prefs.help?.[id];
  const ready = !!o?.prefs.v; // preferences loaded on the client
  const showOpen = auto && ready && !seen && !o?.touring;

  if (showOpen) {
    return (
      <aside aria-label={title} className={`no-print rounded-2xl border border-forest/25 bg-pale/70 px-4 py-3 text-[15px] ${className}`}>
        <p className="flex items-center gap-2 font-semibold text-forest"><Lightbulb aria-hidden size={17} /> {title}</p>
        <div className="mt-1">{children}</div>
        <button type="button" className="btn btn-sm btn-secondary mt-2" onClick={() => o?.dismissHelp(id)}>Got it</button>
      </aside>
    );
  }
  return (
    <details className={`no-print text-[14px] ${className}`}>
      <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 font-semibold text-forest">
        <Lightbulb aria-hidden size={15} /> What does this mean? <span className="sr-only">{title}</span>
      </summary>
      <div className="mt-1 rounded-xl bg-pale/60 px-3 py-2">
        <p className="font-semibold">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </details>
  );
}
