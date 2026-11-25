import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, pickRun, runLabel, PHASE_LABEL } from "@/lib/server/views";
import { getItem, displayOrder, CONTENT_VERSION } from "@/lib/content";
import { LETTERS } from "@/lib/content/order";
import { TeacherGuide } from "@/components/item-views";
import { PrintButton } from "@/components/forms";
import { ConceptArt } from "@/components/art";
import type { FullItem } from "@/lib/content/schema";

export const metadata = { title: "Print" };

function StudentPage({ alias, items, runId, title, concept }: { alias: string | null; items: FullItem[]; runId: string; title: string; concept: string }) {
  return (
    <article className="print-break mx-auto max-w-[760px] bg-white p-8 first:break-before-auto print:p-0">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">Reflection check</p>
          <h2 className="text-[24px] font-bold">{title}</h2>
          <p className="mt-2 text-[16px]">Learner: <strong>{alias ?? "______________"}</strong></p>
        </div>
        <ConceptArt conceptId={concept} className="w-[110px]" />
      </header>
      <p className="mt-3 text-[15px]">Circle one answer and one reason for each question. It is fine to say you are not sure.</p>
      {items.map((item, i) => {
        const order = displayOrder(runId, item);
        const txt = (list: FullItem["answer_options"], id: string) => list.find((o) => o.id === id)!.text;
        return (
          <section key={item.id} className="print-avoid mt-5">
            <p className="text-[13px] font-semibold text-muted">Question {i + 1}</p>
            <p className="text-[17px]">{item.scenario}</p>
            <p className="mt-1 text-[18px] font-bold">{item.question}</p>
            <ul className="mt-2 space-y-1.5">
              {order.answers.map((id, k) => (
                <li key={id} className="flex items-start gap-3 text-[16px]"><span className="grid h-7 w-7 flex-none place-items-center rounded-full border-2 border-ink font-bold">{LETTERS[k]}</span>{txt(item.answer_options, id)}</li>
              ))}
            </ul>
            <p className="mt-3 font-semibold">{item.reason_prompt}</p>
            <ul className="mt-1.5 space-y-1.5">
              {order.reasons.map((id, k) => (
                <li key={id} className="flex items-start gap-3 text-[16px]"><span className="grid h-7 w-7 flex-none place-items-center rounded-full border-2 border-ink font-bold">{LETTERS[k]}</span>{txt(item.reason_options, id)}</li>
              ))}
            </ul>
            <p className="mt-2 text-[14px] text-muted">Optional — how sure are you? &nbsp; sure &nbsp;/&nbsp; somewhat sure &nbsp;/&nbsp; unsure</p>
          </section>
        );
      })}
      <p className="mt-5 text-[14px]">Optional — explain your thinking in a sentence:</p>
      <div className="mt-2 h-8 border-b border-ink/40" />
      <div className="h-8 border-b border-ink/40" />
    </article>
  );
}

export default async function PrintPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ run?: string; copy?: string; blank?: string }> }) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const v = await loadSession(await requireTeacher(), sessionId);
  const run = pickRun(v, sp.run);
  if (!run) notFound();
  const items = run.items.map((r) => getItem(r.itemId, r.version)!);
  const teacher = sp.copy === "teacher";

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link className="link" href={`/sessions/${sessionId}/collect?run=${run.id}`}>← Back to Collect</Link>
        <PrintButton label={teacher ? "Print teacher guide" : "Print student copies"} />
        {!teacher && (
          <Link className="btn btn-secondary" href={`/sessions/${sessionId}/print?run=${run.id}&copy=student${sp.blank ? "" : "&blank=1"}`}>
            {sp.blank ? "One page per learner alias" : "Blank copies instead"}
          </Link>
        )}
        <span className="text-[14px] text-muted">{runLabel(run)} · item versions {run.items.map((i) => `${i.itemId} v${i.version}`).join(", ")}</span>
      </div>
      {teacher ? (
        <article className="mx-auto max-w-[820px] rounded-[22px] bg-white p-8 print:p-0">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-red">Teacher only — do not hand out</p>
              <h1 className="text-[26px] font-bold">{v.module.title}: answer guide</h1>
              <p className="text-muted">{v.bundle.class.title} · {PHASE_LABEL[run.phase]} · letters match the student copies for this check</p>
            </div>
            <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" className="h-auto w-[130px]" />
          </div>
          <div className="mt-5 space-y-6">{items.map((it, i) => <TeacherGuide key={it.id} item={it} seed={run.id} n={i + 1} />)}</div>
          <p className="mt-6 text-[13px] text-muted">
            A wrong answer alone is not proof of a misconception. A calculation slip is not a concept difficulty. “Not sure” stays uncertain. Content {CONTENT_VERSION}: original pilot material — educator review required.
          </p>
        </article>
      ) : sp.blank ? (
        Array.from({ length: 1 }).map((_, i) => <StudentPage key={i} alias={null} items={items} runId={run.id} title={v.module.title} concept={v.session.conceptId} />)
      ) : (
        <div className="space-y-6 print:space-y-0">
          {v.bundle.learners.map((l) => <StudentPage key={l.id} alias={l.alias} items={items} runId={run.id} title={v.module.title} concept={v.session.conceptId} />)}
        </div>
      )}
    </div>
  );
}
