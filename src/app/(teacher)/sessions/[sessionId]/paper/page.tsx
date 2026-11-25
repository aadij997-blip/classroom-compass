import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, pickRun, runLabel } from "@/lib/server/views";
import { getItem, letterMap } from "@/lib/content";
import { PaperGrid, type GridItem, type GridRow } from "./paper-grid";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Paper entry" };

export default async function PaperPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { sessionId } = await params;
  const { run: runParam } = await searchParams;
  const v = await loadSession(await requireTeacher(), sessionId);
  const run = pickRun(v, runParam);
  if (!run) notFound();
  const items: GridItem[] = run.items.map((ref) => {
    const item = getItem(ref.itemId, ref.version)!;
    const m = letterMap(run.id, item);
    return { itemId: item.id, answers: m.answers, reasons: m.reasons };
  });
  const toLetter = (map: Record<string, string>, id: string | null) => (id ? (Object.entries(map).find(([, v]) => v === id)?.[0] ?? "") : "-");
  const rows: GridRow[] = v.bundle.learners.map((l) => ({
    learnerId: l.id,
    alias: l.alias,
    cells: Object.fromEntries(
      items.flatMap((it) => {
        const r = v.bundle.responses.find((x) => x.checkRunId === run.id && x.learnerId === l.id && x.itemId === it.itemId);
        return [
          [`${it.itemId}:a`, r ? toLetter(it.answers, r.answerId) : ""],
          [`${it.itemId}:r`, r ? toLetter(it.reasons, r.reasonId) : ""],
        ];
      }),
    ),
    fromDevice: v.bundle.responses.some((x) => x.checkRunId === run.id && x.learnerId === l.id && x.source === "student_device"),
  }));
  return (
    <div className="space-y-5">
      <Link href={`/sessions/${sessionId}/collect?run=${run.id}`} className="link inline-flex items-center gap-1"><ArrowLeft aria-hidden size={16} /> Back to Collect</Link>
      <div>
        <h1 className="text-[30px] font-bold">Enter paper responses</h1>
        <p className="mt-1 max-w-[75ch] text-muted">
          {runLabel(run)}. Type the letter each learner circled (A–D). Type <kbd className="rounded bg-neutral px-1.5 font-mono">-</kbd> if they left it blank. Leave a cell empty if you have no sheet. The cursor moves on after each letter; arrow keys and Tab also work. Rows save when you leave them.
        </p>
      </div>
      {run.state === "closed" && (
        <p role="status" className="cue cue-amber">This check is closed. Reopen it from Collect to enter or change paper responses.</p>
      )}
      <PaperGrid runId={run.id} items={items} rows={rows} disabled={run.state === "closed"} />
    </div>
  );
}
