import Image from "next/image";
import { learnerSession } from "@/lib/server/context";
import { getItem, getModule, idsToLetters, toStudentItem } from "@/lib/content";
import { CheckFlow } from "./check-flow";
import { ConceptArt } from "@/components/art";

export const dynamic = "force-dynamic";
export const metadata = { title: "My check", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-cream px-4 py-3">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">
          <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" className="h-auto w-[112px]" priority />
          <span className="border-l border-line pl-3 text-[15px] font-semibold">My check</span>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}

function Message({ title, body, concept }: { title: string; body: string; concept?: string }) {
  return (
    <Shell>
      <div className="rounded-[24px] bg-pale p-6 text-center">
        <ConceptArt conceptId={concept ?? "liquidity"} className="mx-auto w-[150px]" />
        <h1 className="mt-3 text-[26px] font-bold">{title}</h1>
        <p className="mt-2 text-[18px]">{body}</p>
      </div>
    </Shell>
  );
}

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  if (link === "busy") return <Message title="One moment" body="Lots of people are opening their links. Wait a few seconds, then scan or open your card again." />;
  if (link === "invalid") return <Message title="That link isn’t working" body="Your card may have been replaced. Ask your teacher for your current card." />;

  const s = await learnerSession();
  const ctx = s ? await s.store.learnerContext(s.session).catch(() => null) : null;
  if (!s || !ctx) return <Message title="Open the link on your card" body="Scan the QR code or open the private link on the card your teacher gave you." />;

  const run = ctx.openRuns[0];
  if (!run) return <Message title={`Hi, ${ctx.alias}!`} body="There’s nothing to answer right now. Your teacher will open the check when it’s time." />;

  const module = getModule(run.conceptId)!;
  // Student-safe projections only: no keys, mappings, or rationale leave the server.
  const items = run.items.map((ref) => toStudentItem(run.id, getItem(ref.itemId, ref.version)!));
  const existing = Object.fromEntries(
    ctx.responses
      .filter((r) => r.checkRunId === run.id)
      .flatMap((r) => {
        const ref = run.items.find((i) => i.itemId === r.itemId);
        if (!ref) return [];
        const letters = idsToLetters(run.id, getItem(ref.itemId, ref.version)!, r.answerId, r.reasonId);
        return [[r.itemId, { ...letters, confidence: r.confidence, explanation: r.explanation }]];
      }),
  );
  return (
    <Shell>
      <CheckFlow alias={ctx.alias} checkRunId={run.id} title={module.title} items={items} existing={existing} art={<ConceptArt conceptId={run.conceptId} className="w-[120px]" />} />
    </Shell>
  );
}
