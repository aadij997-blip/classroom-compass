import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadClass } from "@/lib/server/views";
import { CardsManager } from "./cards-manager";

export default async function CardsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const t = await requireTeacher();
  const b = await loadClass(t, classId);
  return (
    <div>
      <nav aria-label="Breadcrumb" className="no-print text-[14px] text-muted">
        <Link href="/classes" className="hover:underline">Classes</Link> / <Link href={`/classes/${b.class.id}`} className="hover:underline">{b.class.title}</Link> / <span>Learner cards</span>
      </nav>
      <h1 className="no-print mt-3 text-[32px] font-bold">Learner cards</h1>
      <p className="no-print mt-1 max-w-[70ch] text-muted">
        Each learner has one private link. Links are stored only as secure hashes, so we can’t show an old card again — printing creates new cards and turns off the old ones for those learners.
      </p>
      <CardsManager classId={b.class.id} title={b.class.title} learners={b.learners.map((l) => ({ id: l.id, alias: l.alias, hasAccess: l.hasAccess }))} />
    </div>
  );
}
