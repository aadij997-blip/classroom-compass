import { ContextHelp } from "@/components/orientation/context-help";
import { ORIENTATION } from "@/lib/orientation";
import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { allModules, CONTENT_VERSION, getItem, getModule } from "@/lib/content";
import { itemsForPhase } from "@/lib/content/schema";
import { CONCEPT_IDS, type ConceptId } from "@/lib/domain/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { createSessionAction } from "@/app/actions";
import { ConceptArt } from "@/components/art";
import { StudentItemPreview, TeacherGuide } from "@/components/item-views";
import { Stepper } from "@/components/stepper";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Set up a session" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ classId?: string; concept?: string }> }) {
  const t = await requireTeacher();
  const sp = await searchParams;
  const classes = await t.store.listClasses(t.teacherId);
  if (classes.length === 0) {
    return (
      <div className="panel mx-auto max-w-[640px]">
        <h1 className="text-[26px] font-bold">First, create a class</h1>
        <p className="mt-2">Sessions belong to a class.</p>
        <Link href="/classes/new" className="btn btn-primary mt-4">Create a class</Link>
      </div>
    );
  }
  const classId = classes.some((c) => c.class.id === sp.classId) ? sp.classId! : classes[0].class.id;
  const bundle = await t.store.getClassBundle(t.teacherId, classId);
  const used = new Set(bundle?.sessions.map((s) => s.conceptId));
  const nextUnused = CONCEPT_IDS.find((c) => !used.has(c));
  const suggested = nextUnused ?? "opportunity-cost";
  const conceptId: ConceptId = (CONCEPT_IDS as readonly string[]).includes(sp.concept ?? "") ? (sp.concept as ConceptId) : suggested;
  const module = getModule(conceptId)!;
  const anchors = itemsForPhase(module, "exit").map((id) => getItem(id)!);
  const q = (c: string) => `/sessions/new?classId=${classId}&concept=${c}`;

  return (
    <div>
      <Stepper current="setup" />
      <h1 className="mt-4 text-[32px] font-bold">Set up a session</h1>
      <p className="mt-1 text-muted">About two minutes. The defaults work for most lessons.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <section className="panel">
            <h2 className="text-[19px] font-bold">1. Class</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {classes.map((c) => (
                <Link
                  key={c.class.id}
                  href={`/sessions/new?classId=${c.class.id}&concept=${conceptId}`}
                  aria-current={c.class.id === classId ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-xl border-2 px-4 ${c.class.id === classId ? "border-forest bg-pale font-semibold" : "border-line bg-white hover:bg-neutral"}`}
                >
                  {c.class.title}
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2 className="text-[19px] font-bold">2. Concept and goal</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {allModules().map((m) => (
                <Link
                  key={m.id}
                  href={q(m.id)}
                  aria-current={m.id === conceptId ? "true" : undefined}
                  className={`flex flex-col items-center rounded-2xl border-2 p-3 text-center transition-colors ${m.id === conceptId ? "border-forest bg-pale" : "border-line bg-white hover:bg-neutral"}`}
                >
                  <ConceptArt conceptId={m.id} className="w-[96px]" />
                  <span className="mt-1 font-semibold leading-tight">{m.title}</span>
                  <span className="text-[13px] text-muted">Day {m.curriculum_day}{m.id === nextUnused ? " · next in sequence" : ""}</span>
                </Link>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-pale px-4 py-3 text-forest">
              <p className="font-semibold">Goal: {module.goal}</p>
              <p className="mt-1 text-[15px]">Success looks like: “{module.success_criterion}”</p>
            </div>
          </section>

          <ActionForm action={createSessionAction} className="panel space-y-5" statusPosition="end">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="conceptId" value={conceptId} />
            <fieldset data-tour="session-collection-mode">
              <legend className="text-[19px] font-bold">3. How will you collect?</legend>
              <ContextHelp id="collection_mode" auto title={ORIENTATION.contextual_help.collection_mode.title} className="mt-2">
                <ul className="list-disc space-y-0.5 pl-5">
                  <li><strong>Digital:</strong> {ORIENTATION.contextual_help.collection_mode.digital}</li>
                  <li><strong>Paper:</strong> {ORIENTATION.contextual_help.collection_mode.paper}</li>
                  <li><strong>Observation only:</strong> {ORIENTATION.contextual_help.collection_mode.observation_only}</li>
                </ul>
              </ContextHelp>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  { v: "digital", t: "Digital", d: "Private card links on phones or Chromebooks. Paper entries also allowed." },
                  { v: "paper", t: "Paper", d: "Print identical questions, then type answers into a fast grid." },
                  { v: "observation_only", t: "Observation only", d: "Jot what you notice for a learner, group, or the class. No individual check." },
                ].map((o) => (
                  <label key={o.v} className="choice !flex-col !gap-1">
                    <input type="radio" name="mode" value={o.v} defaultChecked={o.v === "digital"} />
                    <span className="font-semibold">{o.t}</span>
                    <span className="text-[14px] text-muted">{o.d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset data-tour="session-check-phase">
              <legend className="text-[19px] font-bold">4. When is the check?</legend>
              <ContextHelp id="check_phase" title={ORIENTATION.contextual_help.check_phase.title}>{ORIENTATION.contextual_help.check_phase.body}</ContextHelp>
              <p className="text-[14px] text-muted">Ignored for observation only.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="choice !flex-col !gap-1">
                  <input type="radio" name="phase" value="exit" defaultChecked />
                  <span className="font-semibold">Exit check — after play</span>
                  <span className="text-[14px] text-muted">During the reflection time you already have.</span>
                </label>
                <label className="choice !flex-col !gap-1">
                  <input type="radio" name="phase" value="before" />
                  <span className="font-semibold">Before check — before play</span>
                  <span className="text-[14px] text-muted">Same questions as the exit check, so the two can be compared for matched learners.</span>
                </label>
              </div>
            </fieldset>
            <SubmitButton pendingLabel="Starting…">Start session <ArrowRight aria-hidden size={18} /></SubmitButton>
          </ActionForm>
        </div>

        <aside className="space-y-4" data-tour="session-preview">
          <details className="panel" open>
            <summary className="cursor-pointer text-[18px] font-bold">Preview: what learners see</summary>
            <p className="mt-1 text-[14px] text-muted">Two answer-and-reason questions. Option order is shuffled per check, and is the same on paper and screen.</p>
            <div className="mt-4 space-y-6">
              {anchors.map((item, i) => <StudentItemPreview key={item.id} item={item} seed="preview" n={i + 1} />)}
            </div>
          </details>
          <details className="panel">
            <summary className="cursor-pointer text-[18px] font-bold">Teacher-only answer guide</summary>
            <div className="mt-4 space-y-6">
              {anchors.map((item, i) => <TeacherGuide key={item.id} item={item} seed="preview" n={i + 1} />)}
            </div>
          </details>
          <p className="px-1 text-[13px] text-muted">Original pilot questions (content {CONTENT_VERSION}) — educator review required.</p>
        </aside>
      </div>
    </div>
  );
}
