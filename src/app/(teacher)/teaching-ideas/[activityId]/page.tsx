import { ContextHelp } from "@/components/orientation/context-help";
import { ORIENTATION } from "@/lib/orientation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/server/context";
import { getActivity, getItem } from "@/lib/content";
import { tagInfo } from "@/lib/content/interpretations";
import { buildInsight, dateLabel, loadSession, pickRun, plural, runLabel } from "@/lib/server/views";
import { ConceptArt } from "@/components/art";
import { ActionForm, SubmitButton } from "@/components/forms";
import { checkAgainAction, markTaughtAction } from "@/app/actions";
import { AudienceForm } from "./audience-form";
import { StudentItemPreview, TeacherGuide } from "@/components/item-views";
import { ArrowLeft, Printer } from "lucide-react";

export const metadata = { title: "Try this together" };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ activityId: string }>;
  searchParams: Promise<{ session?: string; run?: string; rec?: string; action?: string }>;
}) {
  const { activityId } = await params;
  const sp = await searchParams;
  const found = getActivity(activityId);
  if (!found) notFound();
  const { module, activity } = found;
  const t = await requireTeacher();

  // Optional class/session context.
  const view = sp.session ? await loadSession(t, sp.session) : null;
  if (view && view.session.conceptId !== module.id) notFound();
  const run = view ? pickRun(view, sp.run) : null;
  const insight = view && run ? buildInsight(view, run) : null;
  const rec = insight ? (insight.recs.find((r) => r.key === sp.rec) ?? insight.top) : null;
  const existing = view
    ? (view.bundle.actions.find((a) => a.id === sp.action) ??
      [...view.bundle.actions].reverse().find((a) => a.sessionId === view.session.id && a.activityId === activityId && a.decision !== "dismissed"))
    : undefined;
  const followUpRun = existing?.followUpCheckRunId ? view!.runs.find((r) => r.id === existing.followUpCheckRunId) : null;
  const recheckItems = module.recheck_item_ids.map((id) => getItem(id)!);
  const alias = new Map(view?.bundle.learners.map((l) => [l.id, l.alias]) ?? []);

  return (
    <div className="space-y-6">
      {view && (
        <Link href={`/sessions/${view.session.id}/teach${run ? `?run=${run.id}` : ""}`} className="link no-print inline-flex items-center gap-1">
          <ArrowLeft aria-hidden size={16} /> Back to {view.bundle.class.title} · {module.title}
        </Link>
      )}
      <section className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:p-8 md:grid-cols-[1fr_200px]">
        <div>
          <span className="cue cue-white">Try this together · {activity.minutes} minutes · Day {module.curriculum_day}</span>
          <h1 className="mt-3 text-[34px] font-bold">{activity.title}</h1>
          <p className="mt-2 text-[17px]"><strong>Goal:</strong> {module.goal}</p>
          <p className="mt-2 text-[15px] text-forest"><strong>Materials:</strong> {activity.materials.join(" · ")}</p>
        </div>
        <ConceptArt conceptId={module.id} className="mx-auto w-[180px]" />
      </section>

      {view && (
        <section className="panel no-print" aria-labelledby="plan" data-tour="activity-plan">
          {rec && !existing && (
            <div className="mb-5 rounded-2xl bg-blush/60 px-4 py-3 text-[15px]">
              <strong>Why this is suggested: </strong>
              {rec.kind === "extend"
                ? `${rec.count} of ${rec.denominator} completed checks showed the expected answer and reason — the extension can stretch them.`
                : `${rec.count} of ${rec.denominator} completed checks suggest students may be ${tagInfo(rec.tag!).pattern}.`}{" "}
              {run && <>({runLabel(run)}) </>}
              <Link className="link" href={`/sessions/${view.session.id}/thinking?run=${run?.id}&focus=${encodeURIComponent(rec.tag ?? "reasoning_shown")}`}>See the evidence</Link>
            </div>
          )}
          {!existing && (
            <>
              <h2 id="plan" className="text-[20px] font-bold">Who will you teach?</h2>
              <AudienceForm
                sessionId={view.session.id}
                runId={run?.id ?? ""}
                activityId={activity.id}
                recKey={rec?.key ?? "teacher-choice"}
                evidence={(rec?.responseIds ?? []).join(",")}
                suggested={(rec?.kind === "extend" ? [] : (rec?.learnerIds ?? []))}
                learners={view.bundle.learners.map((l) => ({ id: l.id, alias: l.alias }))}
                groups={view.bundle.groups.map((g) => ({ id: g.id, label: g.label, size: g.learnerIds.length }))}
              />
            </>
          )}
          {existing && !existing.taughtAt && (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <span className="cue cue-green">Planned</span>
                <h2 id="plan" className="mt-2 text-[22px] font-bold">Ready to teach</h2>
                <p className="mt-1 text-[15px]">
                  Audience:{" "}
                  {existing.audience === "whole_class"
                    ? "whole class"
                    : existing.audience === "small_group"
                      ? (view.bundle.groups.find((g) => g.id === existing.groupId)?.label ?? "a group")
                      : existing.learnerIds.map((id) => alias.get(id)).join(", ")}
                  {existing.note && ` · ${existing.note}`}
                </p>
                <p className="mt-1 text-[13px] text-muted">“Mark taught” records that you taught it — it is not evidence of learning. Check again for that.</p>
                <ContextHelp id="check_again_planned" title={ORIENTATION.contextual_help.check_again.title} className="mt-1">{ORIENTATION.contextual_help.check_again.body}</ContextHelp>
              </div>
              <ActionForm action={markTaughtAction}>
                <input type="hidden" name="actionId" value={existing.id} />
                <SubmitButton>Mark taught</SubmitButton>
              </ActionForm>
            </div>
          )}
          {existing?.taughtAt && (
            <div data-tour="activity-followup">
              <span className="cue cue-green">Taught {dateLabel(existing.taughtAt)}</span>
              <h2 id="plan" className="mt-2 text-[22px] font-bold">Check again</h2>
              <ContextHelp id="check_again" auto title={ORIENTATION.contextual_help.check_again.title} className="mt-2">{ORIENTATION.contextual_help.check_again.body}</ContextHelp>
              {followUpRun ? (
                <p className="mt-1">
                  A follow-up check is set up ({runLabel(followUpRun)}, {followUpRun.state}).{" "}
                  <Link className="link" href={`/sessions/${view.session.id}/collect?run=${followUpRun.id}`}>Go to Collect</Link>
                </p>
              ) : (
                <>
                  <p className="mt-1 max-w-[70ch] text-[15px]">See what students show now. Fresh questions give new evidence on a different scenario. Repeating the same questions allows a like-for-like comparison for matched learners.</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ActionForm action={checkAgainAction} statusPosition="none">
                      <input type="hidden" name="sessionId" value={view.session.id} />
                      <input type="hidden" name="actionId" value={existing.id} />
                      <input type="hidden" name="kind" value="fresh" />
                      <SubmitButton pendingLabel="Preparing…">Check again with fresh questions</SubmitButton>
                    </ActionForm>
                    <ActionForm action={checkAgainAction} statusPosition="none">
                      <input type="hidden" name="sessionId" value={view.session.id} />
                      <input type="hidden" name="actionId" value={existing.id} />
                      <input type="hidden" name="kind" value="same" />
                      <SubmitButton className="btn btn-secondary" pendingLabel="Preparing…">Repeat the same questions</SubmitButton>
                    </ActionForm>
                  </div>
                </>
              )}
              <ActionForm action={markTaughtAction} className="mt-3">
                <input type="hidden" name="actionId" value={existing.id} />
                <input type="hidden" name="taught" value="false" />
                <SubmitButton className="btn btn-sm btn-secondary">Undo “taught”</SubmitButton>
              </ActionForm>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel" aria-labelledby="steps" data-tour="activity-script">
          <h2 id="steps" className="text-[22px] font-bold">Teacher script</h2>
          <ol className="mt-4 space-y-5">
            {activity.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="num-step">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{plural(s.minutes, "minute")}</p>
                  <p className="mt-1 rounded-2xl bg-pale px-4 py-3 text-[17px]">“{s.teacher_says}”</p>
                  <p className="mt-2 text-[16px]"><strong>Do:</strong> {s.action}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-4">
          <section className="panel">
            <h2 className="text-[18px] font-bold">Listen for this reasoning</h2>
            <p className="mt-2 text-[15px]">{activity.expected_reasoning}</p>
          </section>
          <section className="rounded-[22px] bg-blush/60 p-5">
            <h2 className="text-[18px] font-bold text-terracotta">Scaffold</h2>
            <p className="mt-1 text-[15px]">{activity.scaffold}</p>
          </section>
          <section className="rounded-[22px] bg-amber p-5">
            <h2 className="text-[18px] font-bold text-amber-ink">Extension</h2>
            <p className="mt-1 text-[15px]">{activity.extension}</p>
          </section>
          <section className="panel no-print">
            <h2 className="text-[18px] font-bold">Printables</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn btn-sm btn-secondary" href={`/teaching-ideas/${activity.id}/print?copy=student`}><Printer aria-hidden size={16} /> Student sheet</Link>
              <Link className="btn btn-sm btn-secondary" href={`/teaching-ideas/${activity.id}/print?copy=teacher`}><Printer aria-hidden size={16} /> Teacher copy</Link>
            </div>
          </section>
        </aside>
      </div>

      <section className="panel" aria-labelledby="fresh">
        <h2 id="fresh" className="text-[20px] font-bold">Fresh follow-up questions</h2>
        <p className="mt-1 text-[15px] text-muted">Used by “Check again with fresh questions.” New scenarios, so they add evidence rather than a like-for-like score.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {recheckItems.map((item, i) => (
            <div key={item.id}>
              <StudentItemPreview item={item} seed="preview" n={i + 1} />
              <details className="mt-3 rounded-xl bg-neutral p-3">
                <summary className="cursor-pointer text-[15px] font-semibold">Answer guide</summary>
                <div className="mt-2"><TeacherGuide item={item} seed="preview" n={i + 1} /></div>
              </details>
            </div>
          ))}
        </div>
      </section>
      {!view && (
        <p className="text-[15px] text-muted">
          Want suggestions based on your class? <Link className="link" href="/sessions/new">Set up a session</Link> — the overview will link back here with the evidence.
        </p>
      )}
    </div>
  );
}
