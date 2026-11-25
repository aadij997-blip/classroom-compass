import "server-only";
// Server-rendered item views. The teacher guide reads teacher_only data and
// must only ever be rendered on teacher pages (server components).

import type { FullItem } from "@/lib/content/schema";
import { displayOrder } from "@/lib/content";
import { LETTERS } from "@/lib/content/order";
import { tagInfo } from "@/lib/content/interpretations";

export function StudentItemPreview({ item, seed, n }: { item: FullItem; seed: string; n: number }) {
  const order = displayOrder(seed, item);
  const text = (list: FullItem["answer_options"], id: string) => list.find((o) => o.id === id)!.text;
  return (
    <div className="print-avoid">
      <p className="eyebrow">Question {n}</p>
      <p className="mt-1 text-[17px]">{item.scenario}</p>
      <p className="mt-2 text-[18px] font-semibold">{item.question}</p>
      <ol className="mt-2 space-y-1">
        {order.answers.map((id, i) => (
          <li key={id} className="flex gap-2"><span className="font-bold">{LETTERS[i]}.</span> {text(item.answer_options, id)}</li>
        ))}
      </ol>
      <p className="mt-3 font-semibold">{item.reason_prompt}</p>
      <ol className="mt-1 space-y-1">
        {order.reasons.map((id, i) => (
          <li key={id} className="flex gap-2"><span className="font-bold">{LETTERS[i]}.</span> {text(item.reason_options, id)}</li>
        ))}
      </ol>
    </div>
  );
}

export function TeacherGuide({ item, seed, n }: { item: FullItem; seed: string; n: number }) {
  const order = displayOrder(seed, item);
  const key = item.teacher_only;
  const letter = (kind: "answers" | "reasons", id: string) => LETTERS[order[kind].indexOf(id)];
  const a = item.answer_options.find((o) => o.id === key.expected_answer_id)!;
  const r = item.reason_options.find((o) => o.id === key.expected_reason_id)!;
  return (
    <div className="print-avoid">
      <p className="eyebrow">Question {n} · {item.id} v{item.version}</p>
      <p className="mt-1 font-semibold">{item.question}</p>
      <dl className="mt-2 grid gap-1 text-[15px]">
        <div><dt className="inline font-semibold">Expected answer: </dt><dd className="inline">{letter("answers", a.id)}. {a.text}</dd></div>
        <div><dt className="inline font-semibold">Expected reason: </dt><dd className="inline">{letter("reasons", r.id)}. {r.text}</dd></div>
      </dl>
      <p className="mt-2 text-[15px] font-semibold">Other reasons may suggest (a hypothesis to follow up, not a diagnosis):</p>
      <ul className="mt-1 list-disc pl-5 text-[15px]">
        {Object.entries(key.reason_interpretations).map(([rid, tag]) => (
          <li key={rid}>
            <strong>{letter("reasons", rid)}.</strong> {item.reason_options.find((o) => o.id === rid)?.text} — {tagInfo(tag).short}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[14px] text-muted">{key.rationale}</p>
      <p className="mt-1 text-[14px] text-muted">Access support: {item.access_support}</p>
    </div>
  );
}
