import Link from "next/link";
import { Check } from "lucide-react";

const STEPS = [
  { id: "setup", label: "Set up" },
  { id: "collect", label: "Collect" },
  { id: "teach", label: "Teach" },
] as const;

export function Stepper({ current, sessionId }: { current: (typeof STEPS)[number]["id"]; sessionId?: string }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Session steps" className="no-print">
      <ol className="flex flex-wrap items-center gap-1 text-[14px]">
        {STEPS.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          const inner = (
            <>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${active ? "bg-white text-ink" : done ? "bg-pale text-forest" : "bg-neutral text-muted"}`}>
                {done ? <Check aria-hidden size={14} strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
              {done && <span className="sr-only">(done)</span>}
            </>
          );
          const cls = `inline-flex min-h-10 items-center gap-2 rounded-full px-3 ${active ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"}`;
          return (
            <li key={s.id} className="flex items-center gap-1">
              {sessionId && !active ? (
                <Link href={`/sessions/${sessionId}/${s.id}`} className={cls}>{inner}</Link>
              ) : (
                <span className={cls} aria-current={active ? "step" : undefined}>{inner}</span>
              )}
              {i < STEPS.length - 1 && <span aria-hidden className="px-1 text-muted">→</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
