import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getActivity, getItem } from "@/lib/content";
import { requireTeacher } from "@/lib/server/context";
import { ConceptArt } from "@/components/art";
import { PrintButton } from "@/components/forms";
import { TeacherGuide } from "@/components/item-views";

export default async function ActivityPrint({ params, searchParams }: { params: Promise<{ activityId: string }>; searchParams: Promise<{ copy?: string }> }) {
  await requireTeacher();
  const { activityId } = await params;
  const { copy } = await searchParams;
  const found = getActivity(activityId);
  if (!found) notFound();
  const { module, activity } = found;
  const m = activity.printable_student_material;
  const teacher = copy === "teacher";
  const cards = m.cards ?? m.scenario_cards ?? [];
  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link className="link" href={`/teaching-ideas/${activity.id}`}>← Back to the activity</Link>
        <PrintButton label={teacher ? "Print teacher copy" : "Print student sheet"} />
        <Link className="btn btn-secondary" href={`/teaching-ideas/${activity.id}/print?copy=${teacher ? "student" : "teacher"}`}>{teacher ? "Student sheet instead" : "Teacher copy instead"}</Link>
      </div>
      <article className="mx-auto max-w-[800px] rounded-[22px] bg-white p-8 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className={`text-[13px] font-semibold uppercase tracking-wider ${teacher ? "text-red" : "text-muted"}`}>{teacher ? "Teacher copy" : "Student sheet"}</p>
            <h1 className="text-[28px] font-bold">{teacher ? activity.title : m.title}</h1>
            <p className="text-muted">{module.title} · Day {module.curriculum_day}</p>
          </div>
          {teacher ? <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" className="h-auto w-[130px]" /> : <ConceptArt conceptId={module.id} className="w-[120px]" />}
        </header>
        {teacher ? (
          <div className="mt-5 space-y-5">
            <p><strong>Goal:</strong> {module.goal} <strong>Time:</strong> {activity.minutes} minutes. <strong>Materials:</strong> {activity.materials.join("; ")}.</p>
            <ol className="space-y-3">
              {activity.steps.map((s, i) => (
                <li key={i} className="print-avoid">
                  <strong>{i + 1}. ({s.minutes} min)</strong> Say: “{s.teacher_says}” <br />Do: {s.action}
                </li>
              ))}
            </ol>
            <p><strong>Expected reasoning:</strong> {activity.expected_reasoning}</p>
            <p><strong>Scaffold:</strong> {activity.scaffold}</p>
            <p><strong>Extension:</strong> {activity.extension}</p>
            <h2 className="pt-2 text-[20px] font-bold">Fresh follow-up questions (answer guide)</h2>
            {module.recheck_item_ids.map((id, i) => <TeacherGuide key={id} item={getItem(id)!} seed="preview" n={i + 1} />)}
            <p className="text-[12px] text-muted">Letters here follow the preview order; a launched check shows its own order on its teacher guide.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {m.mat_labels && (
              <div className="grid grid-cols-3 gap-3">
                {m.mat_labels.map((l) => <div key={l} className="grid min-h-[110px] place-items-center rounded-2xl border-2 border-dashed border-ink/40 p-3 text-center font-semibold">{l}</div>)}
              </div>
            )}
            {cards.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {cards.map((c) => <div key={c} className="grid min-h-[90px] place-items-center rounded-2xl border-2 border-ink/50 p-3 text-center text-[16px] font-semibold">{c}</div>)}
              </div>
            )}
            <ol className="space-y-5">
              {m.worksheet_prompts.map((p, i) => (
                <li key={p}>
                  <p className="text-[17px]"><strong>{i + 1}.</strong> {p}</p>
                  <div className="mt-3 h-7 border-b border-ink/40" />
                </li>
              ))}
            </ol>
          </div>
        )}
      </article>
    </div>
  );
}
