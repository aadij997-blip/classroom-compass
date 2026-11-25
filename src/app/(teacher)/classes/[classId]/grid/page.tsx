import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { dateLabel, loadClass, lookup, PHASE_LABEL } from "@/lib/server/views";
import { learnerConceptGrid, SUMMARY_LABEL } from "@/lib/analytics";
import { allModules } from "@/lib/content";
import { SummaryChip } from "@/components/evidence";

export const metadata = { title: "Learner × concept" };

export default async function GridPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const b = await loadClass(await requireTeacher(), classId);
  const modules = allModules();
  const grid = learnerConceptGrid(b, lookup, modules.map((m) => m.id));
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/classes" className="hover:underline">Classes</Link> / <Link href={`/classes/${b.class.id}`} className="hover:underline">{b.class.title}</Link> / <span>Learner × concept</span>
      </nav>
      <h1 className="text-[30px] font-bold">Learner × concept</h1>
      <p className="max-w-[75ch] text-muted">
        Each cell shows what a learner showed on <strong>their most recent check</strong> for that concept (phase and date underneath) — not a permanent level. Confidence is not included. Group and class observations are never shown as individual results.
      </p>
      <div className="flex flex-wrap gap-2 text-[13px]" aria-label="Key">
        {(Object.keys(SUMMARY_LABEL) as (keyof typeof SUMMARY_LABEL)[]).map((k) => <SummaryChip key={k} summary={k} small />)}
        <span className="cue cue-white !text-[13px]">— No check for this concept yet</span>
      </div>
      <div className="overflow-auto rounded-2xl border border-line bg-white" role="region" aria-label="Learner by concept table (scrolls)" tabIndex={0} style={{ maxHeight: "70vh" }}>
        <table className="table min-w-[760px]">
          <caption className="sr-only">Latest check result per learner and concept, with links to each learner’s timeline</caption>
          <thead>
            <tr>
              <th scope="col">Learner</th>
              {modules.map((m) => (
                <th key={m.id} scope="col">{m.title}<span className="block font-normal">Day {m.curriculum_day}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ learner, cells }) => (
              <tr key={learner.id}>
                <th scope="row" className="!static !text-[15px] !text-ink">
                  <Link className="hover:underline" href={`/classes/${b.class.id}/learners/${learner.id}`}>{learner.alias}</Link>
                </th>
                {cells.map((c) => (
                  <td key={c.conceptId}>
                    {c.summary ? (
                      <>
                        <SummaryChip summary={c.summary} small />
                        <span className="mt-1 block text-[12px] text-muted">{PHASE_LABEL[c.phase!]} · {dateLabel(c.date)}</span>
                      </>
                    ) : (
                      <span className="text-muted">—<span className="sr-only">No check for this concept yet</span></span>
                    )}
                    {c.individualObservations > 0 && <span className="mt-1 block text-[12px] text-forest">{c.individualObservations} note{c.individualObservations > 1 ? "s" : ""} about this learner</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
