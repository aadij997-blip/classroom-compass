"use client";
// First-session checklist. Completion comes only from the teacher's own saved
// records (computed on the server); hiding it is a local preference.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ORIENTATION, type ChecklistState } from "@/lib/orientation";
import { loadPrefs, updatePrefs } from "@/lib/orientation/storage";
import { useOrientation } from "./provider";
import { StartTourButton } from "./start-tour";
import { Check, Circle } from "lucide-react";

export function FirstSessionChecklist({ state, classId, sessionId }: { state: ChecklistState; classId: string | null; sessionId: string | null }) {
  const o = useOrientation();
  const [hidden, setHidden] = useState(true); // until preferences load
  useEffect(() => {
    if (o?.ctx.prefKey) setHidden(!!loadPrefs(o.ctx.prefKey).checklistHidden);
  }, [o?.ctx.prefKey]);
  if (hidden || state.allDone || o?.ctx.isDemo) return null;

  const c = ORIENTATION.first_class_checklist;
  const next = state.items.find((i) => !i.done)?.id;
  const href = (id: string) =>
    id === "class" ? "/classes/new" : id === "session" ? (classId ? `/sessions/new?classId=${classId}` : "/sessions/new") : sessionId ? `/sessions/${sessionId}/collect` : "/today";
  const done = state.items.filter((i) => i.done).length;

  return (
    <section aria-labelledby="checklist-title" className="no-print panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="checklist-title" className="text-[20px] font-bold">{c.title}</h2>
          <p className="text-[14px] text-muted">{done} of {state.items.length} done · based on your saved classes and sessions</p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => {
            if (o?.ctx.prefKey) updatePrefs(o.ctx.prefKey, (p) => ({ ...p, checklistHidden: true }));
            setHidden(true);
          }}
        >
          {c.dismiss}
        </button>
      </div>
      <ol className="mt-4 space-y-3">
        {state.items.map((item, i) => {
          const copy = c.items.find((x) => x.id === item.id)!;
          return (
            <li key={item.id} className={`flex gap-3 rounded-2xl px-3 py-2 ${item.id === next ? "bg-pale/70" : ""}`}>
              <span className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full ${item.done ? "bg-forest text-white" : "border-2 border-line bg-white text-muted"}`}>
                {item.done ? <Check aria-hidden size={16} strokeWidth={3} /> : <Circle aria-hidden size={8} fill="currentColor" />}
              </span>
              <div>
                <p className="font-semibold">
                  {i + 1}. {copy.label}
                  <span className="sr-only">{item.done ? " (done)" : " (not done yet)"}</span>
                </p>
                <p className="text-[14px] text-muted">{copy.body}</p>
                {item.id === next && (
                  <Link href={href(item.id)} className="btn btn-sm btn-primary mt-2">{item.id === "class" ? "Create a class" : item.id === "session" ? "Set up a session" : "Go to Collect"}</Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-muted">
        {c.help}
        <StartTourButton className="btn btn-sm btn-secondary">How it works</StartTourButton>
      </div>
    </section>
  );
}
