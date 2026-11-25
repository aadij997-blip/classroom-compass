import { ContextHelp } from "@/components/orientation/context-help";
import { ORIENTATION } from "@/lib/orientation";
import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, lookup, pickRun, runLabel, plural, PHASE_LABEL, dateLabel } from "@/lib/server/views";
import { summarizeCheck } from "@/lib/analytics";
import { LISTEN_FOR, OBSERVATION_CATEGORIES, SUPPORT_OPTIONS, observationCategoryLabel } from "@/lib/content/interpretations";
import { observationsFor } from "@/lib/analytics";
import { Stepper } from "@/components/stepper";
import { ActionForm, SubmitButton } from "@/components/forms";
import { moveToTeachAction, setRunStateAction } from "@/app/actions";
import { ObservationForm } from "@/components/observation-form";
import { LiveRefresh } from "@/components/live-refresh";
import { SpeechArt } from "@/components/art";
import { ArrowRight, Printer, Keyboard, CircleDashed, Check, Minus } from "lucide-react";

export const metadata = { title: "Collect" };

export default async function CollectPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { sessionId } = await params;
  const { run: runParam } = await searchParams;
  const t = await requireTeacher();
  const v = await loadSession(t, sessionId);
  const run = pickRun(v, runParam);
  const listen = LISTEN_FOR[v.session.conceptId];
  const obs = observationsFor(v.bundle, { sessionId });
  const categories = [...OBSERVATION_CATEGORIES[v.session.conceptId], ...OBSERVATION_CATEGORIES.any];

  const observationPanel = (
    <section className="panel" data-tour="collect-observation">
      <h2 className="text-[20px] font-bold">{v.session.mode === "observation_only" ? "Record what you notice" : "Add an observation (optional)"}</h2>
      <p className="mt-1 text-[15px] text-muted">Quick notes during or after play. Choose who it is about so it keeps the right scope.</p>
      <div className="mt-4">
        <ObservationForm
          classId={v.bundle.class.id}
          sessionId={sessionId}
          conceptId={v.session.conceptId}
          learners={v.bundle.learners.map((l) => ({ id: l.id, alias: l.alias }))}
          groups={v.bundle.groups.map((g) => ({ id: g.id, label: g.label, size: g.learnerIds.length }))}
          categories={categories}
          supports={SUPPORT_OPTIONS}
          enrolled={v.bundle.learners.length}
        />
      </div>
      {obs.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">Saved for this session</h3>
          <ul className="mt-2 divide-y divide-line">
            {obs.map(({ observation: o, scopeLabel }) => (
              <li key={o.id} className="py-2 text-[15px]">
                <span className="cue cue-neutral !text-[13px]">{o.scope === "class" ? "Class" : o.scope === "group" ? "Group" : "Learner"}: {scopeLabel}</span>{" "}
                <strong>{observationCategoryLabel(o.category)}</strong>
                {o.tally != null && <> · tally {o.tally}{o.denominator != null ? ` of ${o.denominator}` : ""} (not linked to individual learners)</>}
                {o.note && <span className="text-muted"> — {o.note}</span>}
                <span className="text-muted"> · {dateLabel(o.observedOn)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  const playCue = (
    <section className="grid items-center gap-4 rounded-[22px] bg-blush/70 p-5 sm:grid-cols-[1fr_110px]">
      <div>
        <span className="cue cue-white">While they play</span>
        <p className="mt-2 text-[17px]"><strong>Listen for:</strong> {listen.listen}</p>
        <p className="mt-1 text-[17px]"><strong>Try asking:</strong> {listen.ask}</p>
      </div>
      <SpeechArt className="hidden w-[110px] sm:block" />
    </section>
  );

  if (!run) {
    return (
      <div className="space-y-6">
        <Stepper current="collect" sessionId={sessionId} />
        <h1 className="text-[30px] font-bold">Observation-only session</h1>
        <p className="max-w-[70ch] text-muted">No individual check this time. Your notes keep their scope: class and group notes never become individual results.</p>
        {playCue}
        {observationPanel}
        <ActionForm action={moveToTeachAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <SubmitButton>Go to teaching ideas <ArrowRight aria-hidden size={18} /></SubmitButton>
        </ActionForm>
      </div>
    );
  }

  const sum = summarizeCheck(run, v.bundle.learners, v.bundle.responses, lookup);
  const statusOf = new Map(sum.learners.map((l) => [l.learnerId, l.complete ? "complete" : l.summary === "not_started" ? "not_started" : "started"]));
  const started = sum.incomplete;
  const pct = (n: number) => (sum.eligible ? `${(n / sum.eligible) * 100}%` : "0%");

  return (
    <div className="space-y-6">
      <Stepper current="collect" sessionId={sessionId} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold">{PHASE_LABEL[run.phase]}</h1>
          <p className="text-muted">
            {run.phase === "recheck" ? "Two fresh questions — new evidence, not a like-for-like score." : "Two answer-and-reason questions."}
            {run.followUpOfActionId ? " Launched after a teaching move." : ""}
          </p>
        </div>
        {v.runs.length > 1 && (
          <nav aria-label="Checks in this session" className="flex flex-wrap gap-2">
            {v.runs.map((r) => (
              <Link key={r.id} href={`/sessions/${sessionId}/collect?run=${r.id}`} aria-current={r.id === run.id ? "true" : undefined} className={`btn btn-sm ${r.id === run.id ? "btn-dark" : "btn-secondary"}`}>
                {runLabel(r)}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {run.state === "draft" && playCue}

      <section className="panel" data-tour="collect-status">
        {run.state === "draft" && (
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="cue cue-neutral">Not open yet</span>
              <h2 className="mt-2 text-[24px] font-bold">Open the check during reflection time</h2>
              <p className="mt-1 max-w-[62ch]">Learners can’t see the questions until you open it. Teaching ideas are available any time — you don’t need responses first.</p>
            </div>
            <ActionForm action={setRunStateAction}>
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="state" value="open" />
              <SubmitButton pendingLabel="Opening…">Open the check</SubmitButton>
            </ActionForm>
          </div>
        )}
        {run.state !== "draft" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`cue ${run.state === "open" ? "cue-green" : "cue-neutral"}`}>{run.state === "open" ? "Open — learners can answer" : `Closed ${dateLabel(run.closedAt)}`}</span>
              {run.state === "open" && <LiveRefresh />}
            </div>
            <h2 className="mt-3 text-[24px] font-bold">
              {sum.complete} of {sum.eligible} complete
            </h2>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-neutral" role="img" aria-label={`${sum.complete} complete, ${started} started, ${sum.notStarted} not started`}>
              <div style={{ width: pct(sum.complete), background: "#14532d" }} />
              <div style={{ width: pct(started), background: "#b9bdae" }} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
              <li className="flex items-center gap-2"><Check aria-hidden size={16} className="text-forest" /> Complete: <strong>{sum.complete}</strong></li>
              <li className="flex items-center gap-2"><Minus aria-hidden size={16} /> Started, not finished: <strong>{started}</strong></li>
              <li className="flex items-center gap-2"><CircleDashed aria-hidden size={16} /> Not started: <strong>{sum.notStarted}</strong></li>
            </ul>
            {sum.notStarted + started > 0 && <p className="mt-2 text-[15px] text-muted">Some responses are still missing. Missing is not incorrect.</p>}
            {run.state === "open" ? (
              <ContextHelp id="collect_open" auto title={ORIENTATION.contextual_help.collect_open.title} className="mt-3">{ORIENTATION.contextual_help.collect_open.body}</ContextHelp>
            ) : (
              <ContextHelp id="collect_closed" auto title={ORIENTATION.contextual_help.collect_closed.title} className="mt-3">{ORIENTATION.contextual_help.collect_closed.body}</ContextHelp>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">Who has finished? ({plural(sum.eligible, "learner")})</summary>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {v.bundle.learners.map((l) => {
                  const st = statusOf.get(l.id);
                  return (
                    <li key={l.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[14px] ${st === "complete" ? "border-forest/40 bg-pale" : "border-line bg-white"}`}>
                      {st === "complete" ? <Check aria-hidden size={15} className="text-forest" /> : st === "started" ? <Minus aria-hidden size={15} /> : <CircleDashed aria-hidden size={15} className="text-muted" />}
                      <span>{l.alias}</span>
                      <span className="sr-only">: {st === "complete" ? "complete" : st === "started" ? "started" : "not started"}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <ActionForm action={moveToTeachAction} statusPosition="none">
                <input type="hidden" name="sessionId" value={sessionId} />
                {run.state === "open" && <input type="hidden" name="runId" value={run.id} />}
                <SubmitButton pendingLabel="Closing…">{run.state === "open" ? "Close the check and see their thinking" : "See their thinking"} <ArrowRight aria-hidden size={18} /></SubmitButton>
              </ActionForm>
              <ActionForm action={setRunStateAction} statusPosition="none">
                <input type="hidden" name="runId" value={run.id} />
                <input type="hidden" name="state" value={run.state === "open" ? "closed" : "open"} />
                <SubmitButton className="btn btn-secondary">{run.state === "open" ? "Close without moving on" : "Reopen the check"}</SubmitButton>
              </ActionForm>
            </div>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5" data-tour="collect-tools">
          <Link href={`/sessions/${sessionId}/paper?run=${run.id}`} className="btn btn-sm btn-secondary"><Keyboard aria-hidden size={16} /> Enter paper responses</Link>
          <Link href={`/sessions/${sessionId}/print?run=${run.id}&copy=student`} className="btn btn-sm btn-secondary"><Printer aria-hidden size={16} /> Print student copies</Link>
          <Link href={`/sessions/${sessionId}/print?run=${run.id}&copy=teacher`} className="btn btn-sm btn-secondary"><Printer aria-hidden size={16} /> Print teacher guide</Link>
          <Link href={`/classes/${v.bundle.class.id}/cards`} className="btn btn-sm btn-secondary">Learner cards</Link>
        </div>
        <p className="mt-3 text-[14px] text-muted">
          {sum.sources.paper_entered_by_teacher > 0 && `${plural(sum.sources.paper_entered_by_teacher, "learner")} entered from paper. `}
          Learners open their own private card link — there is no class code or name list to pick from.
        </p>
      </section>

      {run.state !== "draft" && playCue}
      {observationPanel}
    </div>
  );
}
