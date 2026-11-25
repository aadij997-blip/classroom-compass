import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadSession, MODE_LABEL, dateLabel } from "@/lib/server/views";
import { CONCEPT_SHORT } from "@/lib/content/interpretations";

export default async function SessionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const t = await requireTeacher();
  const v = await loadSession(t, sessionId);
  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-start justify-between gap-4">
        <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
          <Link href="/classes" className="hover:underline">Classes</Link> /{" "}
          <Link href={`/classes/${v.bundle.class.id}`} className="hover:underline">{v.bundle.class.title}</Link> /{" "}
          <span>{v.module.title}</span>
        </nav>
        <div className="rounded-2xl border border-line bg-white px-4 py-2 text-[14px] leading-snug">
          {v.bundle.class.title} · Grades {v.bundle.class.gradeBand}
          <br />
          <strong>{CONCEPT_SHORT[v.session.conceptId]} · Day {v.module.curriculum_day}</strong>
          <span className="text-muted"> · {MODE_LABEL[v.session.mode]} · {dateLabel(v.session.createdAt)}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
