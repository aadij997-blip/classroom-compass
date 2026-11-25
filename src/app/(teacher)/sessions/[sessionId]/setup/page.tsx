import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, pickRun, MODE_LABEL, PHASE_LABEL } from "@/lib/server/views";
import { getItem } from "@/lib/content";
import { Stepper } from "@/components/stepper";
import { StudentItemPreview, TeacherGuide } from "@/components/item-views";
import { ConceptArt } from "@/components/art";
import { Printer } from "lucide-react";

export const metadata = { title: "Set up" };

export default async function SetupPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const v = await loadSession(await requireTeacher(), sessionId);
  const run = pickRun(v);
  const items = run?.items.map((r) => getItem(r.itemId, r.version)!) ?? [];
  return (
    <div className="space-y-6">
      <Stepper current="setup" sessionId={sessionId} />
      <section className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:grid-cols-[1fr_150px]">
        <div>
          <span className="cue cue-white">Day {v.module.curriculum_day} · {MODE_LABEL[v.session.mode]}</span>
          <h1 className="mt-3 text-[30px] font-bold">{v.module.title}</h1>
          <p className="mt-2 text-[17px]"><strong>Goal:</strong> {v.session.goal}</p>
          <p className="mt-1 text-forest">Success looks like: “{v.module.success_criterion}”</p>
        </div>
        <ConceptArt conceptId={v.session.conceptId} className="hidden w-[150px] sm:block" />
      </section>
      {run ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <h2 className="text-[20px] font-bold">What learners see — {PHASE_LABEL[run.phase]}</h2>
            <div className="mt-4 space-y-6">{items.map((it, i) => <StudentItemPreview key={it.id} item={it} seed={run.id} n={i + 1} />)}</div>
            <Link className="btn btn-sm btn-secondary mt-5" href={`/sessions/${sessionId}/print?run=${run.id}&copy=student`}><Printer aria-hidden size={16} /> Print student copies</Link>
          </section>
          <section className="panel">
            <h2 className="text-[20px] font-bold">Teacher-only answer guide</h2>
            <div className="mt-4 space-y-6">{items.map((it, i) => <TeacherGuide key={it.id} item={it} seed={run.id} n={i + 1} />)}</div>
            <Link className="btn btn-sm btn-secondary mt-5" href={`/sessions/${sessionId}/print?run=${run.id}&copy=teacher`}><Printer aria-hidden size={16} /> Print teacher guide</Link>
          </section>
        </div>
      ) : (
        <p className="panel">Observation only — no questions to preview.</p>
      )}
      <Link href={`/sessions/${sessionId}/collect`} className="btn btn-primary">Go to Collect</Link>
    </div>
  );
}
