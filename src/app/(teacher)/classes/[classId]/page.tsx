import { ContextHelp } from "@/components/orientation/context-help";
import { ORIENTATION } from "@/lib/orientation";
import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { dateLabel, loadClass, lookup, MODE_LABEL, PHASE_LABEL, plural } from "@/lib/server/views";
import { getModule } from "@/lib/content";
import { summarizeCheck } from "@/lib/analytics";
import { ArrowRight, FileText, Grid3x3, KeyRound, Settings } from "lucide-react";
import { ConceptArt } from "@/components/art";

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const t = await requireTeacher();
  const b = await loadClass(t, classId);
  const noAccess = b.learners.filter((l) => !l.hasAccess).length;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/classes" className="hover:underline">Classes</Link> / <span>{b.class.title}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold">{b.class.title}</h1>
          <p className="mt-1 text-muted">Grades {b.class.gradeBand} · {plural(b.learners.length, "learner")} · {plural(b.groups.length, "table group")}</p>
        </div>
        <Link href={`/sessions/new?classId=${b.class.id}`} className="btn btn-primary">Start a session <ArrowRight aria-hidden size={18} /></Link>
      </div>

      <ContextHelp id="class_tools" auto title={ORIENTATION.contextual_help.class_tools.title} className="mt-5">{ORIENTATION.contextual_help.class_tools.body}</ContextHelp>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-tour="class-tools">
        {[
          { href: `/classes/${b.class.id}/report`, label: "Class report", sub: "Printable summary", Icon: FileText },
          { href: `/classes/${b.class.id}/grid`, label: "Learner × concept", sub: "Latest check per concept", Icon: Grid3x3 },
          { href: `/classes/${b.class.id}/cards`, label: "Learner cards", sub: noAccess ? `${noAccess} without a working card` : "Print or replace", Icon: KeyRound },
          { href: `/classes/${b.class.id}/settings`, label: "Groups & settings", sub: "Tables, learners, delete", Icon: Settings },
        ].map(({ href, label, sub, Icon }) => (
          <Link key={href} href={href} className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition-shadow hover:shadow-md">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-pale text-forest"><Icon aria-hidden size={20} /></span>
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-[14px] text-muted">{sub}</span>
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-[22px] font-bold">Sessions</h2>
        {b.sessions.length === 0 ? (
          <div className="panel mt-3 grid items-center gap-4 sm:grid-cols-[1fr_140px]">
            <p className="text-[17px]">No sessions yet. A session pairs one concept with a short reflection check, paper copies, or your own observations.</p>
            <ConceptArt conceptId="opportunity-cost" className="hidden w-[140px] sm:block" />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {b.sessions.map((s) => {
              const module = getModule(s.conceptId)!;
              const runs = b.checkRuns.filter((r) => r.sessionId === s.id);
              const open = runs.find((r) => r.state === "open");
              const latest = runs.at(-1);
              const sum = latest ? summarizeCheck(latest, b.learners, b.responses, lookup) : null;
              const obs = b.observations.filter((o) => o.sessionId === s.id).length;
              return (
                <li key={s.id} className="panel flex flex-wrap items-center justify-between gap-4 !py-4">
                  <div className="flex items-center gap-4">
                    <ConceptArt conceptId={s.conceptId} className="hidden w-[64px] sm:block" />
                    <div>
                      <p className="font-semibold">{module.title} <span className="font-normal text-muted">· Day {module.curriculum_day}</span></p>
                      <p className="text-[14px] text-muted">
                        {dateLabel(s.createdAt)} · {MODE_LABEL[s.mode]}
                        {latest && sum && ` · ${PHASE_LABEL[latest.phase]}: ${sum.complete} of ${sum.eligible} complete`}
                        {runs.length > 1 && ` · ${runs.length} checks`}
                        {obs > 0 && ` · ${plural(obs, "observation")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {open && <span className="cue cue-green">Open now</span>}
                    <Link href={`/sessions/${s.id}/${open ? "collect" : "teach"}`} className="btn btn-sm btn-secondary">{open ? "Collect" : "Open"}</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[22px] font-bold">Learners</h2>
        <p className="text-[15px] text-muted">Open a learner to see their responses, reviews, observations, and teaching actions. Teacher only.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {b.learners.map((l) => (
            <li key={l.id}>
              <Link href={`/classes/${b.class.id}/learners/${l.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-3 text-[15px] hover:bg-neutral">
                {l.alias}
                {!l.hasAccess && <span className="sr-only"> (no working card)</span>}
                {!l.hasAccess && <span aria-hidden className="ml-2 h-2 w-2 rounded-full bg-muted/40" />}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
