import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { buildInsight, comparableEarlierRun, dateLabel, loadSession, lookup, pickRun, plural, runLabel, PHASE_LABEL } from "@/lib/server/views";
import { getItem, optionText } from "@/lib/content";
import { CONCEPT_SHORT, observationCategoryLabel, tagInfo } from "@/lib/content/interpretations";
import { observationsFor, SUMMARY_LABEL, summarizeCheck, type LearnerCheckSummary } from "@/lib/analytics";
import { Stepper } from "@/components/stepper";
import { ConceptArt } from "@/components/art";
import { DistributionBar, SUMMARY_STYLE } from "@/components/evidence";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Teach" };

const ORDER: LearnerCheckSummary[] = ["reasoning_shown", "worth_another_look", "mixed", "unsure"];

export default async function TeachPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { sessionId } = await params;
  const { run: runParam } = await searchParams;
  const t = await requireTeacher();
  const v = await loadSession(t, sessionId);
  const run = pickRun(v, runParam);
  const activity = v.module.activity;
  const insight = run ? buildInsight(v, run) : null;
  const top = insight?.top ?? null;
  const ctx = `session=${sessionId}${run ? `&run=${run.id}` : ""}`;
  const activityHref = `/teaching-ideas/${activity.id}?${ctx}${top ? `&rec=${encodeURIComponent(top.key)}` : ""}`;
  const thinkingHref = (focus?: string | null) => `/sessions/${sessionId}/thinking?run=${run?.id ?? ""}${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`;
  const sessionObs = observationsFor(v.bundle, { sessionId });
  const actions = v.bundle.actions.filter((a) => a.sessionId === sessionId);
  const comparison = run && run.phase === "exit" ? comparableEarlierRun(v.bundle, run) : null;
  const followUps = v.runs.filter((r) => r.phase === "recheck");

  return (
    <div className="space-y-6">
      <Stepper current="teach" sessionId={sessionId} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your next teaching move</p>
          <h1 className="mt-1 text-[32px] font-bold sm:text-[36px]">See the thinking. Keep learning moving.</h1>
        </div>
        {v.runs.length > 1 && (
          <nav aria-label="Choose a check" className="flex flex-wrap gap-2">
            {v.runs.map((r) => (
              <Link key={r.id} href={`/sessions/${sessionId}/teach?run=${r.id}`} aria-current={r.id === run?.id ? "true" : undefined} className={`btn btn-sm ${r.id === run?.id ? "btn-dark" : "btn-secondary"}`}>
                {runLabel(r)}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Level 1 — one suggested teaching move */}
      <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr]">
        <section aria-labelledby="next-step" className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:p-8 md:grid-cols-[1fr_170px]">
          <div>
            <span className="cue cue-white">A good next step · {activity.minutes} minutes</span>
            <h2 id="next-step" className="mt-3 text-[30px] font-bold sm:text-[34px]">{insight?.headline ?? activity.title}</h2>
            <p className="mt-2 max-w-[54ch] text-[17px]">
              {insight
                ? insight.sentence
                : "This session used observations only, so there are no individual check results. The activity is ready whenever you want it."}
            </p>
            {insight?.missing && <p className="mt-1 text-[15px] text-forest">Some responses are still missing: {insight.missing}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Link href={activityHref} className="btn btn-primary">Try this together <ArrowRight aria-hidden size={18} /></Link>
              {top && <Link href={thinkingHref(top.tag ?? "reasoning_shown")} className="link text-[15px]">See the responses behind this suggestion</Link>}
            </div>
            {insight && insight.recs.length > 1 && (
              <details className="mt-4 text-[15px]">
                <summary className="cursor-pointer font-semibold text-forest">Other choices ({insight.recs.length - 1})</summary>
                <ul className="mt-2 space-y-2">
                  {insight.recs.slice(1).map((r) => (
                    <li key={r.key} className="rounded-xl bg-white/70 px-3 py-2">
                      <strong>{r.kind === "extend" ? "Stretch with the extension" : tagInfo(r.tag!).short}</strong> — {r.count} of {r.denominator} completed checks.{" "}
                      <Link className="link" href={`/teaching-ideas/${r.activityId}?${ctx}&rec=${encodeURIComponent(r.key)}`}>Use this</Link> ·{" "}
                      <Link className="link" href={thinkingHref(r.tag ?? "reasoning_shown")}>See evidence</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <ConceptArt conceptId={v.session.conceptId} className="mx-auto w-[150px] md:w-[170px]" />
        </section>

        {/* Level 2 — what we noticed */}
        <section aria-labelledby="noticed" className="panel">
          <span className="cue cue-blush">What we noticed</span>
          <h2 id="noticed" className="mt-3 text-[24px] font-bold">A quick class picture</h2>
          {insight && run ? (
            <>
              <p className="mt-1 text-[14px] text-muted">
                {PHASE_LABEL[run.phase]} · {run.items.length} {CONCEPT_SHORT[v.session.conceptId].toLowerCase()} items · {dateLabel(run.openedAt ?? run.createdAt)} ·{" "}
                {insight.summary.sources.student_device} on devices{insight.summary.sources.paper_entered_by_teacher ? `, ${insight.summary.sources.paper_entered_by_teacher} from paper` : ""}
              </p>
              <div className="mt-4">
                <DistributionBar
                  label={`Of ${insight.summary.complete} completed checks: ${ORDER.map((k) => `${insight.summary.distribution[k]} ${SUMMARY_LABEL[k]}`).join(", ")}`}
                  parts={ORDER.map((k) => ({ key: k, count: insight.summary.distribution[k] }))}
                />
              </div>
              <ul className="mt-3 space-y-2">
                {ORDER.filter((k) => insight.summary.distribution[k] > 0 || k === "reasoning_shown" || k === "worth_another_look").map((k) => {
                  const S = SUMMARY_STYLE[k];
                  return (
                    <li key={k} className="flex items-center gap-3 text-[15px]">
                      <S.Icon aria-hidden size={17} className={k === "worth_another_look" ? "text-terracotta" : k === "reasoning_shown" ? "text-forest" : "text-amber-ink"} />
                      <Link href={thinkingHref(k)} className="hover:underline">{SUMMARY_LABEL[k]}</Link>
                      <strong className="ml-auto text-[19px]">{insight.summary.distribution[k]}</strong>
                    </li>
                  );
                })}
              </ul>
              <div className="panel-quiet mt-4 text-[14px]">
                <strong>
                  {insight.summary.complete} of {insight.summary.eligible} students completed the check.
                </strong>
                <br />
                {insight.summary.notStarted + insight.summary.incomplete > 0
                  ? `${insight.summary.notStarted + insight.summary.incomplete} have not completed it${insight.summary.incomplete ? ` (${insight.summary.incomplete} started)` : ""}. Missing is not incorrect.`
                  : "Everyone on the roster completed it."}
                {insight.summary.complete > 0 && insight.summary.complete < 8 && <><br />Only a few responses so far — treat this picture as tentative.</>}
              </div>
              <details className="mt-3 text-[14px]">
                <summary className="cursor-pointer font-semibold">Confidence (reported separately, never scored)</summary>
                <p className="mt-2">
                  Sure: {insight.summary.confidence.sure} · Somewhat sure: {insight.summary.confidence.somewhat_sure} · Unsure: {insight.summary.confidence.unsure} · Not given: {insight.summary.confidence.none}
                  <span className="text-muted"> (counted per answer)</span>
                </p>
              </details>
            </>
          ) : (
            <div className="mt-3 space-y-3 text-[15px]">
              <p>Observation notes for this session (they describe the scope they were taken for):</p>
              {sessionObs.length === 0 && <p className="text-muted">No observations yet.</p>}
              {sessionObs.map(({ observation: o, scopeLabel }) => (
                <div key={o.id} className="panel-quiet">
                  <strong>{observationCategoryLabel(o.category)}</strong> — {scopeLabel}
                  {o.tally != null && <> · {o.tally}{o.denominator != null ? ` of ${o.denominator}` : ""} (class tally; does not identify which learners)</>}
                  {o.note && <p className="mt-1 text-muted">{o.note}</p>}
                </div>
              ))}
              <Link href={`/sessions/${sessionId}/collect`} className="link">Add an observation</Link>
            </div>
          )}
        </section>
      </div>

      {/* Level 3 — see their thinking (preview) + teaching script */}
      {run && insight && (
        <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr]">
          <section aria-labelledby="thinking" className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="thinking" className="text-[20px] font-bold">See their thinking</h2>
              <span className="text-[13px] text-muted">Evidence first</span>
            </div>
            <div className="mt-3 space-y-5">
              {insight.summary.items.map((ib, i) => {
                const item = getItem(ib.itemId, ib.itemVersion)!;
                const topPair = ib.pairs[0];
                const tagged = top?.tag ? ib.pairs.find((p) => item.teacher_only.reason_interpretations[p.reasonId] === top.tag) : null;
                const highlight = tagged ?? topPair;
                return (
                  <div key={ib.itemId}>
                    <p className="text-[13px] font-semibold text-muted">Question {i + 1} · {ib.answered} answered with a reason</p>
                    <blockquote className="mt-1 border-l-4 border-lime pl-4 text-[16px]">
                      {item.scenario} <strong>{item.question}</strong>
                    </blockquote>
                    {highlight && (
                      <p className="mt-2 text-[14px] text-muted">
                        {highlight.count} chose the reason: “{optionText(item, "reason", highlight.reasonId)}”
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <Link href={thinkingHref()} className="link mt-4 inline-block">Open the questions and every response →</Link>
          </section>

          <section aria-labelledby="try" className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="try" className="text-[20px] font-bold">Try it, then check again</h2>
              <span className="text-[13px] text-muted">Teacher script</span>
            </div>
            <ol className="mt-3 space-y-3">
              {activity.steps.slice(0, 3).map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px]">
                  <span className="num-step">{i + 1}</span>
                  <span>{s.action}</span>
                </li>
              ))}
            </ol>
            <Link href={activityHref} className="link mt-4 inline-block">Full activity, printables, and recheck →</Link>
          </section>
        </div>
      )}

      {comparison && comparison.comparison.comparable && (
        <section className="panel" aria-labelledby="compare">
          <h2 id="compare" className="text-[20px] font-bold">Before and exit — same questions, matched learners</h2>
          <p className="mt-1 text-[14px] text-muted">
            {runLabel(comparison.before)} → {runLabel(run!)}. Identical item versions. Only learners who completed both are compared.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="panel-quiet">
              <p className="text-[13px] text-muted">Matched learners</p>
              <p className="text-[26px] font-bold">{comparison.comparison.matched}</p>
            </div>
            <div className="panel-quiet">
              <p className="text-[13px] text-muted">Reasoning shown — matched learners</p>
              <p className="text-[20px] font-bold">
                Before {comparison.comparison.beforeShownInMatched} of {comparison.comparison.matched} → Exit {comparison.comparison.afterShownInMatched} of {comparison.comparison.matched}
              </p>
            </div>
            <div className="panel-quiet">
              <p className="text-[13px] text-muted">Reasoning shown — everyone who did the exit check</p>
              <p className="text-[20px] font-bold">{comparison.comparison.afterShownAllRespondents} of {comparison.comparison.afterRespondents}</p>
            </div>
          </div>
          <p className="mt-3 text-[14px]">
            Not in the matched comparison: {plural(comparison.comparison.afterOnly, "learner")} with an exit check only, {comparison.comparison.beforeOnly} with a before check only, {comparison.comparison.missingBoth} with neither.
          </p>
          <p className="mt-1 text-[14px] text-muted">
            This describes what learners showed on two short items on two days. It does not show lasting change or that the game caused it.
          </p>
        </section>
      )}

      {followUps.length > 0 && run?.phase !== "recheck" && (
        <section className="panel">
          <h2 className="text-[20px] font-bold">Fresh follow-up checks</h2>
          <p className="mt-1 text-[14px] text-muted">Different questions, so they add new evidence rather than a like-for-like comparison.</p>
          <ul className="mt-3 space-y-2">
            {followUps.map((r) => {
              const s = summarizeCheck(r, v.bundle.learners, v.bundle.responses, lookup);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span>{runLabel(r)} — {s.complete} of {s.eligible} complete · reasoning shown on this check: {s.distribution.reasoning_shown} of {s.complete}</span>
                  <Link className="link" href={`/sessions/${sessionId}/teach?run=${r.id}`}>Open</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="text-[20px] font-bold">Teaching moves in this session</h2>
        {actions.length === 0 ? (
          <p className="mt-2 text-[15px] text-muted">None yet. Choose “Try this together” to pick an audience and save your plan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[15px]">
                <span>
                  <strong>{a.decision === "dismissed" ? "Dismissed" : a.taughtAt ? "Taught" : "Planned"}</strong>: {activity.title} ·{" "}
                  {a.audience === "whole_class" ? "whole class" : a.audience === "small_group" ? (v.bundle.groups.find((g) => g.id === a.groupId)?.label ?? "a group") : plural(a.learnerIds.length, "learner")}
                  {a.taughtAt && ` · ${dateLabel(a.taughtAt)}`}
                  {a.followUpCheckRunId && " · follow-up check launched"}
                </span>
                {a.decision !== "dismissed" && (
                  <Link className="link" href={`/teaching-ideas/${a.activityId}?session=${sessionId}&action=${a.id}`}>{a.taughtAt ? "Check again" : "Open"}</Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {sessionObs.length > 0 && run && (
          <p className="mt-3 text-[14px] text-muted">
            {plural(sessionObs.length, "observation")} recorded for this session — see them under “See their thinking”.
          </p>
        )}
      </section>
    </div>
  );
}
