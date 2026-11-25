import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/server/context";
import { dateLabel, loadClass, lookup, runLabel } from "@/lib/server/views";
import { getItem, getModule, optionText } from "@/lib/content";
import { observationCategoryLabel, tagInfo } from "@/lib/content/interpretations";
import { summarizeLearner } from "@/lib/analytics";
import { OutcomeChip, SummaryChip } from "@/components/evidence";

export const metadata = { title: "Learner timeline" };

type Event = { at: string; key: string; node: React.ReactNode };

export default async function LearnerPage({ params }: { params: Promise<{ classId: string; learnerId: string }> }) {
  const { classId, learnerId } = await params;
  const t = await requireTeacher();
  const b = await loadClass(t, classId);
  const learner = b.learners.find((l) => l.id === learnerId);
  if (!learner) notFound();
  const groups = b.groups.filter((g) => g.learnerIds.includes(learner.id));
  const events: Event[] = [];

  for (const run of b.checkRuns) {
    const mine = b.responses.filter((r) => r.checkRunId === run.id && r.learnerId === learner.id);
    if (!mine.length) continue;
    const s = summarizeLearner(run, learner.id, b.responses, lookup, b.reviews);
    const session = b.sessions.find((x) => x.id === run.sessionId)!;
    events.push({
      at: mine.map((m) => m.updatedAt).sort().at(-1)!,
      key: run.id,
      node: (
        <>
          <p className="font-semibold">{getModule(run.conceptId)!.title} — {runLabel(run)}</p>
          <div className="mt-1"><SummaryChip summary={s.summary} small /></div>
          <ul className="mt-2 space-y-2 text-[14px]">
            {s.items.map((i, n) => {
              const item = getItem(i.itemId, i.itemVersion)!;
              const reviews = i.response ? b.reviews.filter((r) => r.responseId === i.response!.id) : [];
              return (
                <li key={i.itemId} className="panel-quiet">
                  <p className="font-semibold">Q{n + 1}. {item.question}</p>
                  <p>Answer: {optionText(item, "answer", i.response?.answerId ?? null) ?? <em>blank</em>}</p>
                  <p>Reason: {optionText(item, "reason", i.response?.reasonId ?? null) ?? <em>blank</em>}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2"><OutcomeChip outcome={i.outcome} />{i.tag && i.tagKind !== "uncertain" && <span className="text-muted">{tagInfo(i.tag).short}</span>}</div>
                  {i.response?.confidence && <p className="mt-1 text-muted">Confidence (not scored): {i.response.confidence.replace("_", " ")}</p>}
                  {i.response?.explanation && <p className="mt-1">“{i.response.explanation}” — {i.explanation === "pending" ? "review pending" : `reviewed ${i.explanationScore}/2`}</p>}
                  {reviews.map((r) => <p key={r.id} className="mt-1 text-forest">Teacher {r.kind === "explanation_score" ? `review ${r.score}/2` : `note (${r.stance})`}: {r.note || "—"} · {dateLabel(r.createdAt)}</p>)}
                  {i.response && <p className="mt-1 text-[12px] text-muted">{i.response.source === "paper_entered_by_teacher" ? "Entered from paper" : "On a device"}{i.response.revision > 1 ? ` · revised ${i.response.revision - 1}×` : ""}</p>}
                </li>
              );
            })}
          </ul>
          <Link className="link mt-2 inline-block text-[14px]" href={`/sessions/${session.id}/thinking?run=${run.id}`}>See the whole class on this check</Link>
        </>
      ),
    });
  }
  for (const o of b.observations) {
    const direct = o.scope === "individual" && o.learnerId === learner.id;
    const viaGroup = o.scope === "group" && groups.some((g) => g.id === o.groupId);
    if (!direct && !viaGroup) continue;
    events.push({
      at: o.createdAt,
      key: o.id,
      node: (
        <>
          <p className="font-semibold">{direct ? "Observation about this learner" : `Group observation — ${groups.find((g) => g.id === o.groupId)?.label}`}</p>
          <p className="text-[15px]">{observationCategoryLabel(o.category)}{o.note ? ` — ${o.note}` : ""}</p>
          {o.supports && <p className="text-[13px] text-muted">Supports: {o.supports}</p>}
          {viaGroup && <p className="text-[13px] text-muted">Shown for context only. It is about the group and is not an individual result.</p>}
        </>
      ),
    });
  }
  for (const a of b.actions) {
    const included = a.audience === "whole_class" || a.learnerIds.includes(learner.id) || (a.groupId && groups.some((g) => g.id === a.groupId));
    if (!included || a.decision === "dismissed") continue;
    events.push({
      at: a.taughtAt ?? a.createdAt,
      key: a.id,
      node: (
        <>
          <p className="font-semibold">Teaching move {a.taughtAt ? "taught" : "planned"}: {getModule(b.sessions.find((s) => s.id === a.sessionId)!.conceptId)!.activity.title}</p>
          <p className="text-[13px] text-muted">{a.audience === "whole_class" ? "Whole class" : a.audience === "small_group" ? "Table group" : "Selected learners"}. Teaching is recorded as an action, not as evidence of learning.</p>
        </>
      ),
    });
  }
  events.sort((x, y) => y.at.localeCompare(x.at));

  return (
    <div className="max-w-[860px] space-y-5">
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/classes" className="hover:underline">Classes</Link> / <Link href={`/classes/${b.class.id}`} className="hover:underline">{b.class.title}</Link> / <span>{learner.alias}</span>
      </nav>
      <div>
        <p className="eyebrow">Teacher only</p>
        <h1 className="text-[32px] font-bold">{learner.alias}</h1>
        <p className="text-muted">
          {groups.length ? `Group: ${groups.map((g) => g.label).join(", ")} · ` : ""}Card {learner.hasAccess ? "working" : "off / not issued"}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="panel">No responses, observations, or teaching moves for this learner yet.</p>
      ) : (
        <ol className="space-y-4">
          {events.map((e) => (
            <li key={e.key} className="panel">
              <p className="text-[13px] text-muted">{dateLabel(e.at)}</p>
              <div className="mt-1">{e.node}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
