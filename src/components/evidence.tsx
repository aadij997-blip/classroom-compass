// Evidence states always pair colour with an icon and a text label.
import { Check, CircleDashed, Eye, HelpCircle, Shuffle, Minus } from "lucide-react";
import type { LearnerCheckSummary, ItemOutcome } from "@/lib/analytics";
import { SUMMARY_LABEL } from "@/lib/analytics";

export const SUMMARY_STYLE: Record<LearnerCheckSummary, { cls: string; bar: string; Icon: typeof Check }> = {
  reasoning_shown: { cls: "cue-green", bar: "#14532d", Icon: Check },
  worth_another_look: { cls: "cue-blush", bar: "#d98b76", Icon: Eye },
  mixed: { cls: "cue-amber", bar: "#c99a2e", Icon: Shuffle },
  unsure: { cls: "cue-amber", bar: "#e8cf86", Icon: HelpCircle },
  incomplete: { cls: "cue-neutral", bar: "#b9bdae", Icon: Minus },
  not_started: { cls: "cue-neutral", bar: "#e2e4da", Icon: CircleDashed },
};

export function SummaryChip({ summary, small }: { summary: LearnerCheckSummary; small?: boolean }) {
  const s = SUMMARY_STYLE[summary];
  return (
    <span className={`cue ${s.cls} ${small ? "!text-[13px] !px-2 !py-0.5" : ""}`}>
      <s.Icon aria-hidden size={small ? 14 : 16} strokeWidth={2.5} />
      {SUMMARY_LABEL[summary]}
    </span>
  );
}

export const OUTCOME_LABEL: Record<ItemOutcome, string> = {
  expected: "Expected answer and reason",
  partial: "Expected answer, different reason",
  mixed: "Mixed — needs a look",
  difficulty: "Possible difficulty",
  uncertain: "Chose “not sure”",
  incomplete: "Not enough to read",
};

const OUTCOME_STYLE: Record<ItemOutcome, LearnerCheckSummary> = {
  expected: "reasoning_shown",
  partial: "mixed",
  mixed: "mixed",
  difficulty: "worth_another_look",
  uncertain: "unsure",
  incomplete: "incomplete",
};

export function OutcomeChip({ outcome }: { outcome: ItemOutcome }) {
  const s = SUMMARY_STYLE[OUTCOME_STYLE[outcome]];
  return (
    <span className={`cue ${s.cls} !text-[13px] !px-2 !py-0.5`}>
      <s.Icon aria-hidden size={14} strokeWidth={2.5} />
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/** Stacked distribution bar. Purely visual: the same numbers are always listed in text next to it. */
export function DistributionBar({ parts, label }: { parts: { key: LearnerCheckSummary; count: number }[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.count, 0);
  if (total === 0) return <div className="h-4 rounded-full bg-neutral" aria-hidden />;
  return (
    <div className="flex h-4 overflow-hidden rounded-full bg-neutral" role="img" aria-label={label}>
      {parts
        .filter((p) => p.count > 0)
        .map((p) => (
          <div key={p.key} style={{ width: `${(p.count / total) * 100}%`, background: SUMMARY_STYLE[p.key].bar }} className="border-r-2 border-white last:border-r-0" />
        ))}
    </div>
  );
}
