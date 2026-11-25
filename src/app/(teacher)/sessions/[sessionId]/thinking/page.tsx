import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, lookup, pickRun, runLabel, plural, dateLabel } from "@/lib/server/views";
import { getItem, optionText, displayOrder } from "@/lib/content";
import { LETTERS } from "@/lib/content/order";
import { observationCategoryLabel, tagInfo, TAGS } from "@/lib/content/interpretations";
import { observationsFor, summarizeCheck, SUMMARY_LABEL, type LearnerCheckSummary } from "@/lib/analytics";
import { OutcomeChip, SummaryChip } from "@/components/evidence";
import { TeacherGuide } from "@/components/item-views";
import { ActionForm, SubmitButton } from "@/components/forms";
import { addReviewAction } from "@/app/actions";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "See their thinking" };

const SUMMARY_KEYS = Object.keys(SUMMARY_LABEL) as LearnerCheckSummary[];

export default async function ThinkingPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ run?: string; focus?: string }> }) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const t = await requireTeacher();
  const v = await loadSession(t, sessionId);
  const run = pickRun(v, sp.run);
  const obs = observationsFor(v.bundle, { sessionId });
  const alias = new Map(v.bundle.learners.map((l) => [l.id, l.alias]));
  const back = `/sessions/${sessionId}/teach${run ? `?run=${run.id}` : ""}`;

  if (!run) {
    return (
      <div className="space-y-4">
        <Link href={back} className="link inline-flex items-center gap-1"><ArrowLeft aria-hidden size={16} /> Back to the overview</Link>
        <h1 className="text-[30px] font-bold">See their thinking</h1>
        <p>This session has no check — only observations.</p>
      </div>
    );
  }

  const sum = summarizeCheck(run, v.bundle.learners, v.bundle.responses, lookup, v.bundle.reviews);
  const focus = sp.focus ?? null;
  const focusIsSummary = !!focus && (SUMMARY_KEYS as string[]).includes(focus);
  const focusIsTag = !!focus && !focusIsSummary && !!TAGS[focus];
  const tagEvidence = focusIsTag ? sum.tags.find((x) => x.tag === focus) : null;
  const inFocus = (learnerId: string, itemTag: string | null) => {
    if (!focus) return true;
    const l = sum.learners.find((x) => x.learnerId === learnerId)!;
    if (focusIsSummary) return l.summary === focus;
    if (focusIsTag) return l.complete && itemTag === focus;
    return true;
  };
  const reviewsFor = (responseId: string) => v.bundle.reviews.filter((r) => r.responseId === responseId);
  const notStarted = sum.learners.filter((l) => l.summary === "not_started");

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={back} className="link inline-flex items-center gap-1"><ArrowLeft aria-hidden size={16} /> Back to the overview</Link>
        <span className="text-[14px] text-muted">{runLabel(run)} · {sum.complete} of {sum.eligible} completed</span>
      </div>
      <h1 className="text-[30px] font-bold">See their thinking</h1>

      {focus && (
        <div className="rounded-2xl bg-blush/60 px-5 py-4">
          <p className="font-semibold">
            {focusIsTag && tagEvidence && (
              <>Showing the evidence behind “{tagInfo(focus).short}”: {plural(tagEvidence.learnerIds.length, "learner")}, {plural(tagEvidence.responseIds.length, "response")} among {sum.complete} completed checks.</>
            )}
            {focusIsTag && !tagEvidence && <>No completed responses show “{tagInfo(focus).short}”.</>}
            {focusIsSummary && <>Showing learners whose check reads: {SUMMARY_LABEL[focus as LearnerCheckSummary]} ({sum.distribution[focus as LearnerCheckSummary]}).</>}
          </p>
          <p className="mt-1 text-[14px]">A possible difficulty is a hypothesis to follow up, not a diagnosis. <Link className="link" href={`/sessions/${sessionId}/thinking?run=${run.id}`}>Show everyone</Link></p>
        </div>
      )}

      {sum.items.map((ib, idx) => {
        const item = getItem(ib.itemId, ib.itemVersion)!;
        const order = displayOrder(run.id, item);
        const L = (kind: "answers" | "reasons", id: string | null) => (id ? LETTERS[order[kind].indexOf(id)] : "—");
        const rows = sum.learners
          .map((l) => ({ l, r: l.items.find((i) => i.itemId === ib.itemId)! }))
          .filter(({ l, r }) => l.summary !== "not_started" && inFocus(l.learnerId, r.tag));
        return (
          <section key={ib.itemId} className="panel" aria-labelledby={`q-${idx}`}>
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div>
                <h2 id={`q-${idx}`} className="text-[20px] font-bold">Question {idx + 1}</h2>
                <p className="mt-2 text-[16px]">{item.scenario}</p>
                <p className="mt-1 font-semibold">{item.question}</p>
                <h3 className="mt-4 text-[15px] font-semibold">Answer and reason pairs ({ib.answered} learners answered both)</h3>
                <table className="table mt-2">
                  <thead><tr><th scope="col">Answer</th><th scope="col">Reason</th><th scope="col" className="text-right">Learners</th></tr></thead>
                  <tbody>
                    {ib.pairs.map((p) => {
                      const tag = p.reasonId === item.teacher_only.expected_reason_id ? null : item.teacher_only.reason_interpretations[p.reasonId];
                      return (
                        <tr key={`${p.answerId}${p.reasonId}`}>
                          <td>{L("answers", p.answerId)}. {optionText(item, "answer", p.answerId)}</td>
                          <td>
                            {L("reasons", p.reasonId)}. {optionText(item, "reason", p.reasonId)}
                            {tag && <span className="mt-1 block text-[13px] text-terracotta">May suggest: {tagInfo(tag).short}</span>}
                          </td>
                          <td className="text-right font-bold">{p.count}</td>
                        </tr>
                      );
                    })}
                    {ib.pairs.length === 0 && <tr><td colSpan={3} className="text-muted">No complete answers yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <details className="self-start rounded-2xl bg-neutral p-4">
                <summary className="cursor-pointer font-semibold">Teacher-only answer guide</summary>
                <div className="mt-3"><TeacherGuide item={item} seed={run.id} n={idx + 1} /></div>
              </details>
            </div>

            <h3 className="mt-6 text-[16px] font-semibold">Learner responses {focus ? `(filtered: ${rows.length})` : `(${rows.length})`}</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-line" role="region" aria-label={`Responses to question ${idx + 1}`} tabIndex={0}>
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th scope="col">Learner</th><th scope="col">Answer</th><th scope="col">Reason</th><th scope="col">Reading on this item</th><th scope="col">Confidence</th><th scope="col">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ l, r }) => (
                    <tr key={l.learnerId}>
                      <td className="font-semibold">
                        <Link className="hover:underline" href={`/classes/${v.bundle.class.id}/learners/${l.learnerId}`}>{alias.get(l.learnerId)}</Link>
                        {r.response?.source === "paper_entered_by_teacher" && <span className="block text-[12px] font-normal text-muted">from paper</span>}
                        {r.response && r.response.revision > 1 && <span className="block text-[12px] font-normal text-muted">changed {r.response.revision - 1}×</span>}
                      </td>
                      <td>{r.response?.answerId ? `${L("answers", r.response.answerId)}. ${optionText(item, "answer", r.response.answerId)}` : <span className="text-muted">Blank</span>}</td>
                      <td>{r.response?.reasonId ? `${L("reasons", r.response.reasonId)}. ${optionText(item, "reason", r.response.reasonId)}` : <span className="text-muted">Blank</span>}</td>
                      <td>
                        <OutcomeChip outcome={r.outcome} />
                        {r.tag && r.tagKind !== "uncertain" && <span className="mt-1 block text-[13px] text-muted">{tagInfo(r.tag).short}</span>}
                        {r.response && reviewsFor(r.response.id).filter((x) => x.kind === "interpretation_note").map((x) => (
                          <span key={x.id} className="mt-1 block text-[13px] text-forest">Your note ({x.stance}): {x.note}</span>
                        ))}
                      </td>
                      <td className="text-[14px]">{r.response?.confidence?.replace("_", " ") ?? <span className="text-muted">—</span>}</td>
                      <td className="max-w-[300px] text-[14px]">
                        {r.response?.explanation ? (
                          <>
                            <p>“{r.response.explanation}”</p>
                            <p className="mt-1 text-[13px]">
                              {r.explanation === "pending" ? <span className="cue cue-neutral !text-[12px]">Review pending — not scored</span> : <span className="cue cue-green !text-[12px]">Reviewed: {r.explanationScore}/2</span>}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.response && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[13px] font-semibold text-forest">Review or add context</summary>
                            <div className="mt-2 space-y-3">
                              {r.response.explanation && (
                                <ActionForm action={addReviewAction}>
                                  <input type="hidden" name="classId" value={v.bundle.class.id} />
                                  <input type="hidden" name="responseId" value={r.response.id} />
                                  <input type="hidden" name="kind" value="explanation_score" />
                                  <fieldset>
                                    <legend className="text-[13px] font-semibold">Explanation rubric</legend>
                                    {[
                                      ["0", "0 — does not yet address the concept"],
                                      ["1", "1 — relevant but incomplete"],
                                      ["2", "2 — coherent use of the concept"],
                                    ].map(([val, lab]) => (
                                      <label key={val} className="flex min-h-9 items-center gap-2 text-[13px]">
                                        <input type="radio" name="score" value={val} required className="accent-[#14532d]" /> {lab}
                                      </label>
                                    ))}
                                  </fieldset>
                                  <input className="input mt-1 !min-h-9 text-[13px]" name="note" placeholder="Optional note" maxLength={600} />
                                  <SubmitButton className="btn btn-sm btn-secondary mt-2">Save review</SubmitButton>
                                </ActionForm>
                              )}
                              <ActionForm action={addReviewAction}>
                                <input type="hidden" name="classId" value={v.bundle.class.id} />
                                <input type="hidden" name="responseId" value={r.response.id} />
                                <input type="hidden" name="kind" value="interpretation_note" />
                                <label className="block text-[13px] font-semibold">
                                  About this reading
                                  <select name="stance" className="input mt-1 !min-h-9 text-[13px]" defaultValue="context">
                                    <option value="context">Add context</option>
                                    <option value="disagree">I read this differently</option>
                                    <option value="agree">I agree</option>
                                  </select>
                                </label>
                                <input className="input mt-1 !min-h-9 text-[13px]" name="note" required placeholder="e.g. Misread the question; explained it aloud" maxLength={600} />
                                <SubmitButton className="btn btn-sm btn-secondary mt-2">Save note</SubmitButton>
                                <p className="mt-1 text-[12px] text-muted">Saved beside the response. The original answer and reading are kept.</p>
                              </ActionForm>
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="text-muted">No learners match this view.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="panel">
        <h2 className="text-[20px] font-bold">Learner-level summary for this check</h2>
        <p className="mt-1 text-[14px] text-muted">The rule: both items need an answer and a reason to be read. A label describes this check only. See docs/INTERPRETATION-RULES.md.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {sum.learners
            .filter((l) => !focusIsSummary || l.summary === focus)
            .map((l) => (
              <li key={l.learnerId} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-[14px]">
                <Link className="font-semibold hover:underline" href={`/classes/${v.bundle.class.id}/learners/${l.learnerId}`}>{alias.get(l.learnerId)}</Link>
                <SummaryChip summary={l.summary} small />
              </li>
            ))}
        </ul>
        {notStarted.length > 0 && !focus && (
          <p className="mt-3 text-[14px] text-muted">No response yet: {notStarted.map((l) => alias.get(l.learnerId)).join(", ")}.</p>
        )}
      </section>

      {obs.length > 0 && (
        <section className="panel">
          <h2 className="text-[20px] font-bold">Observations in this session</h2>
          <ul className="mt-3 space-y-2 text-[15px]">
            {obs.map(({ observation: o, scopeLabel }) => (
              <li key={o.id} className="panel-quiet">
                <span className="cue cue-white !text-[13px]">{o.scope === "class" ? "Whole class" : o.scope === "group" ? `Group · ${scopeLabel}` : scopeLabel}</span>{" "}
                <strong>{observationCategoryLabel(o.category)}</strong>
                {o.tally != null && <> · tally {o.tally}{o.denominator != null ? ` of ${o.denominator}` : ""}</>}
                <span className="text-muted"> · {dateLabel(o.observedOn)}</span>
                {o.note && <p className="mt-1">{o.note}</p>}
                {o.scope !== "individual" && <p className="mt-1 text-[13px] text-muted">Applies to the {o.scope}; not added to any individual learner’s evidence.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
