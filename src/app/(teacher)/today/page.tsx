import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { buildInsight, dateLabel, loadSession, pickRun, plural, PHASE_LABEL } from "@/lib/server/views";
import { getModule } from "@/lib/content";
import { CONCEPT_SHORT } from "@/lib/content/interpretations";
import { ChecklistArt, ConceptArt } from "@/components/art";
import { ArrowRight } from "lucide-react";
import { startDemo } from "@/app/actions";
import { deriveChecklist } from "@/lib/orientation";
import { FirstSessionChecklist } from "@/components/orientation/checklist";
import { WelcomeDialog } from "@/components/orientation/welcome";
import { StartTourButton } from "@/components/orientation/start-tour";

export const metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const t = await requireTeacher();
  const { reset } = await searchParams;
  const classes = await t.store.listClasses(t.teacherId);

  // First-session checklist: derived only from this teacher's own saved records.
  let checklist = null;
  if (t.mode !== "demo") {
    const latest = [...classes].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
    const b = latest ? await t.store.getClassBundle(t.teacherId, latest.class.id) : null;
    const sessionIds = new Set(b?.sessions.map((x) => x.id) ?? []);
    const runIds = new Set(b?.checkRuns.filter((r) => sessionIds.has(r.sessionId)).map((r) => r.id) ?? []);
    const evidenceCount = (b?.responses.filter((r) => runIds.has(r.checkRunId)).length ?? 0) + (b?.observations.filter((o) => o.sessionId && sessionIds.has(o.sessionId)).length ?? 0);
    checklist = {
      state: deriveChecklist({
        classes: classes.map((c) => ({ id: c.class.id, learnerCount: c.learnerCount, lastActivityAt: c.lastActivityAt })),
        sessionCount: sessionIds.size,
        evidenceCount,
      }),
      classId: latest?.class.id ?? null,
      sessionId: b?.sessions[0]?.id ?? null,
    };
  }

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[760px] py-6">
        {t.mode !== "demo" && <WelcomeDialog />}
        <p className="eyebrow">Today</p>
        <h1 className="mt-2 text-[34px] font-bold">Let’s set up your first class</h1>
        <p className="mt-2 text-[17px] text-muted">
          It takes about a minute. You will get numbered learner aliases (no student names needed) and private cards for the digital check.{" "}
          <Link href="/classes/new" className="link">Create a class</Link>
        </p>
        <div className="mt-6">
          {checklist && <FirstSessionChecklist {...checklist} />}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-muted">
          Want to look around first?
          <StartTourButton className="btn btn-sm btn-secondary">Take a quick walkthrough</StartTourButton>
          <form action={startDemo}>
            <button className="btn btn-sm btn-secondary">Explore a sample class</button>
          </form>
          <span className="text-[14px]">(fictional; separate from your classes)</span>
        </div>
      </div>
    );
  }

  // Find the single most useful thing to do now.
  const recent = classes.flatMap((c) => (c.resumeSessionId ? [{ c, sessionId: c.resumeSessionId }] : []));
  let primary: React.ReactNode = null;

  const pick = recent[0];
  if (pick) {
    const view = await loadSession(t, pick.sessionId);
    const run = pickRun(view);
    const insight = run ? buildInsight(view, run) : null;
    const open = run?.state === "open";
    primary = (
      <section data-tour="today-next-step" className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:p-8 md:grid-cols-[1fr_190px]">
        <div>
          <span className="cue cue-white">{open ? "Collecting now" : "Pick up where you left off"}</span>
          <h2 className="mt-3 text-[28px] font-bold">{view.module.title}</h2>
          <p className="mt-1 text-forest">
            {view.bundle.class.title} · {CONCEPT_SHORT[view.session.conceptId]} · Day {view.module.curriculum_day}
          </p>
          {insight && run && (
            <p className="mt-3 text-[17px]">
              {PHASE_LABEL[run.phase]}: {insight.summary.complete} of {insight.summary.eligible} completed
              {insight.summary.notStarted + insight.summary.incomplete > 0 ? ` — some responses are still missing.` : "."}
            </p>
          )}
          <Link href={`/sessions/${view.session.id}/${open || !run ? "collect" : "teach"}`} className="btn btn-primary mt-5">
            {open ? "Resume collecting" : "Continue"} <ArrowRight aria-hidden size={18} />
          </Link>
        </div>
        <ConceptArt conceptId={view.session.conceptId} className="hidden w-[190px] md:block" />
      </section>
    );
  } else {
    // Most recent session with evidence → its next step; otherwise start one.
    const latest = classes.map((c) => c).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
    const bundle = await t.store.getClassBundle(t.teacherId, latest.class.id);
    const session = bundle?.sessions.find((s) => bundle.checkRuns.some((r) => r.sessionId === s.id && bundle.responses.some((x) => x.checkRunId === r.id)));
    if (session) {
      const view = await loadSession(t, session.id);
      const run = pickRun(view)!;
      const insight = buildInsight(view, run);
      primary = (
        <section data-tour="today-next-step" className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:p-8 md:grid-cols-[1fr_190px]">
          <div>
            <span className="cue cue-white">A good next step{view.module.activity.minutes ? ` · ${view.module.activity.minutes} minutes` : ""}</span>
            <h2 className="mt-3 text-[30px] font-bold">{insight.headline}</h2>
            <p className="mt-2 max-w-[56ch] text-[17px]">{insight.sentence}</p>
            {insight.missing && <p className="mt-1 text-[15px] text-forest">{insight.missing}</p>}
            <p className="mt-2 text-[14px] text-muted">
              {view.bundle.class.title} · {PHASE_LABEL[run.phase]} · {dateLabel(run.openedAt ?? run.createdAt)}
            </p>
            <Link href={`/sessions/${view.session.id}/teach`} className="btn btn-primary mt-5">
              See their thinking <ArrowRight aria-hidden size={18} />
            </Link>
          </div>
          <ConceptArt conceptId={view.session.conceptId} className="hidden w-[190px] md:block" />
        </section>
      );
    }
  }

  return (
    <div>
      {reset && <p role="status" className="cue cue-green mb-4">The sample class was reset.</p>}
      <p className="eyebrow">Today</p>
      <h1 className="mt-2 text-[32px] font-bold sm:text-[36px]">Hi {t.mode === "demo" ? "there" : t.displayName.split(" ")[0]} — here’s what’s useful now</h1>
      <div className="mt-6">
        {primary ?? (
          <section data-tour="today-next-step" className="grid items-center gap-6 rounded-[24px] bg-pale p-6 sm:p-8 md:grid-cols-[1fr_170px]">
            <div>
              <span className="cue cue-white">Ready when you are</span>
              <h2 className="mt-3 text-[28px] font-bold">Start a session</h2>
              <p className="mt-2 text-[17px]">Pick a concept, choose digital, paper, or observation only, and you’re set. Most choices come pre-filled.</p>
              <Link href="/sessions/new" className="btn btn-primary mt-5">Set up a session <ArrowRight aria-hidden size={18} /></Link>
            </div>
            <ChecklistArt className="hidden w-[150px] md:block" />
          </section>
        )}
      </div>

      {checklist && !checklist.state.allDone && (
        <div className="mt-6">
          <FirstSessionChecklist {...checklist} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[20px] font-bold">Your classes</h2>
            {primary && <Link href="/sessions/new" className="link text-[15px]">Start a new session</Link>}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {classes.map((c) => (
              <li key={c.class.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/classes/${c.class.id}`} className="text-[17px] font-semibold hover:underline">{c.class.title}</Link>
                  <p className="text-[14px] text-muted">
                    Grades {c.class.gradeBand} · {plural(c.learnerCount, "learner")} · {plural(c.sessionCount, "session")}
                  </p>
                </div>
                <Link href={`/sessions/new?classId=${c.class.id}`} className="btn btn-sm btn-secondary">New session</Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2 className="text-[20px] font-bold">The loop</h2>
          <ol className="mt-3 space-y-2 text-[16px]">
            {["Choose a goal and set up", "Play InvestQuest", "Two quick reflection questions", "See their thinking", "Try this together", "Check again"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="num-step !h-8 !w-8 text-[14px]">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[14px] text-muted">
            Concepts: {["opportunity-cost", "diversification", "liquidity"].map((id) => `${getModule(id)!.title} (Day ${getModule(id)!.curriculum_day})`).join(" · ")}
          </p>
        </section>
      </div>
    </div>
  );
}
