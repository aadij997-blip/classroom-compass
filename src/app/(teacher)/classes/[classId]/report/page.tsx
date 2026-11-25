import Link from "next/link";
import Image from "next/image";
import { requireTeacher } from "@/lib/server/context";
import { dateLabel, loadClass, lookup, MODE_LABEL, PHASE_LABEL, plural } from "@/lib/server/views";
import { allModules, CONTENT_VERSION } from "@/lib/content";
import { tagInfo, observationCategoryLabel } from "@/lib/content/interpretations";
import { compareRuns, summarizeCheck, SUMMARY_LABEL } from "@/lib/analytics";
import { PrintButton } from "@/components/forms";

export const metadata = { title: "Class report" };

export default async function ReportPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const b = await loadClass(await requireTeacher(), classId);
  const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const practiced = allModules().filter((m) => b.sessions.some((s) => s.conceptId === m.id));
  const dates = b.sessions.map((s) => s.createdAt).sort();

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <Link className="link" href={`/classes/${b.class.id}`}>← Back to {b.class.title}</Link>
        <PrintButton label="Print or save as PDF" />
        <span className="text-[14px] text-muted">Aggregate only — no learner aliases are included.</span>
      </div>
      <article className="mx-auto max-w-[880px] rounded-[22px] bg-white p-8 print:max-w-none print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="eyebrow">Classroom Compass · class report</p>
            <h1 className="mt-1 text-[30px] font-bold">{b.class.title}</h1>
            <p className="text-muted">
              Grades {b.class.gradeBand} · {plural(b.learners.length, "learner")} on the roster ·{" "}
              {dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}` : "no sessions yet"} · generated {generated}
            </p>
          </div>
          <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" className="h-auto w-[140px]" />
        </header>

        <section className="mt-6">
          <h2 className="text-[20px] font-bold">Concepts practiced</h2>
          {practiced.length === 0 ? (
            <p className="mt-2 text-muted">No sessions yet.</p>
          ) : (
            <p className="mt-2">{practiced.map((m) => `${m.title} (Day ${m.curriculum_day})`).join(" · ")}</p>
          )}
        </section>

        {practiced.map((m) => {
          const sessions = b.sessions.filter((s) => s.conceptId === m.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
          const runs = b.checkRuns.filter((r) => r.conceptId === m.id && r.state !== "draft").sort((x, y) => x.createdAt.localeCompare(y.createdAt));
          const before = runs.filter((r) => r.phase === "before");
          const exits = runs.filter((r) => r.phase === "exit");
          const comparisons = exits.flatMap((e) => before.filter((bf) => bf.createdAt < e.createdAt).map((bf) => ({ bf, e, c: compareRuns(bf, e, b.learners, b.responses, lookup) }))).filter((x) => x.c.comparable).slice(-1);
          const actions = b.actions.filter((a) => sessions.some((s) => s.id === a.sessionId));
          const obs = b.observations.filter((o) => o.conceptId === m.id);
          return (
            <section key={m.id} className="print-avoid mt-8 border-t border-line pt-6">
              <h2 className="text-[22px] font-bold">{m.title}</h2>
              <p className="text-[14px] text-muted">
                {plural(sessions.length, "session")} · modes: {[...new Set(sessions.map((s) => MODE_LABEL[s.mode]))].join(", ")}
              </p>

              {runs.length > 0 && (
                <table className="table mt-3">
                  <thead>
                    <tr><th scope="col">Check</th><th scope="col">Coverage</th><th scope="col">What learners showed (of completed)</th><th scope="col">Most common possible difficulty</th></tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const s = summarizeCheck(r, b.learners, b.responses, lookup, b.reviews);
                      const top = s.tags.find((x) => x.kind !== "uncertain");
                      return (
                        <tr key={r.id}>
                          <td>{PHASE_LABEL[r.phase]}<span className="block text-[12px] text-muted">{dateLabel(r.openedAt ?? r.createdAt)}{r.phase === "recheck" ? " · fresh questions" : ""}</span></td>
                          <td>{s.complete} of {s.eligible} completed<span className="block text-[12px] text-muted">{s.notStarted + s.incomplete} missing or incomplete</span></td>
                          <td className="text-[14px]">
                            {s.complete === 0
                              ? "No completed checks"
                              : (["reasoning_shown", "worth_another_look", "mixed", "unsure"] as const).filter((k) => s.distribution[k] > 0).map((k) => `${SUMMARY_LABEL[k]}: ${s.distribution[k]}`).join(" · ")}
                          </td>
                          <td className="text-[14px]">{top ? `${tagInfo(top.tag).short} (${top.learnerIds.length})` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {comparisons.map(({ bf, e, c }) =>
                c.comparable ? (
                  <div key={e.id} className="panel-quiet mt-3 text-[15px]">
                    <strong>Matched before/exit comparison</strong> ({dateLabel(bf.createdAt)} → {dateLabel(e.createdAt)}, identical questions): {c.matched} matched learners. Reasoning shown before: {c.beforeShownInMatched} of {c.matched}; at exit: {c.afterShownInMatched} of {c.matched}. All exit respondents: {c.afterShownAllRespondents} of {c.afterRespondents}. Not matched: {c.afterOnly} exit-only, {c.beforeOnly} before-only.
                  </div>
                ) : null,
              )}
              {runs.some((r) => r.phase === "recheck") && (
                <p className="mt-2 text-[14px] text-muted">Fresh follow-up checks use different questions; they add evidence and are not compared numerically with the anchor checks.</p>
              )}

              <h3 className="mt-4 font-semibold">Teaching actions</h3>
              {actions.length === 0 ? (
                <p className="text-[15px] text-muted">None recorded.</p>
              ) : (
                <ul className="mt-1 list-disc pl-5 text-[15px]">
                  {actions.map((a) => (
                    <li key={a.id}>
                      {m.activity.title} — {a.decision === "dismissed" ? "suggestion dismissed" : a.taughtAt ? `taught ${dateLabel(a.taughtAt)}` : "planned"} ·{" "}
                      {a.audience === "whole_class" ? "whole class" : a.audience === "small_group" ? "a table group" : plural(a.learnerIds.length, "learner")}
                      {a.followUpCheckRunId ? " · follow-up check launched" : ""}
                    </li>
                  ))}
                </ul>
              )}
              {obs.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">Observations</h3>
                  <ul className="mt-1 list-disc pl-5 text-[15px]">
                    {obs.map((o) => (
                      <li key={o.id}>
                        {o.scope === "class" ? "Whole class" : o.scope === "group" ? "A table group" : "An individual learner"}: {observationCategoryLabel(o.category)}
                        {o.tally != null ? ` (tally ${o.tally}${o.denominator != null ? ` of ${o.denominator}` : ""})` : ""} · {dateLabel(o.observedOn)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}

        <section className="print-avoid mt-8 border-t border-line pt-6 text-[14px]">
          <h2 className="text-[18px] font-bold">How to read this report — limitations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Checks are two short answer-and-reason items. Labels describe what learners showed on that check, not lasting ability or financial behavior.</li>
            <li>Counts are unique learners. Missing or incomplete checks are reported separately and are never counted as incorrect.</li>
            <li>Before/exit comparisons include only matched learners on identical question versions. They do not show that the game or lesson caused a change.</li>
            <li>Possible difficulties are hypotheses for follow-up. A calculation slip is reported separately from a concept difficulty.</li>
            <li>Confidence and unreviewed explanations do not affect any count. Observations keep their class, group, or individual scope.</li>
            <li>Questions are original pilot material (content {CONTENT_VERSION}) requiring educator review; they are not validated research instruments.</li>
          </ul>
        </section>
      </article>
    </div>
  );
}
