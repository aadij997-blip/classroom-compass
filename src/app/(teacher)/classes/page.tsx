import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { plural, dateLabel } from "@/lib/server/views";
import { Plus } from "lucide-react";

export const metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const t = await requireTeacher();
  const { deleted } = await searchParams;
  const classes = await t.store.listClasses(t.teacherId);
  return (
    <div>
      {deleted && <p role="status" className="cue cue-green mb-4">The class and all of its records were deleted. Its learner cards no longer work.</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Classes</p>
          <h1 className="mt-2 text-[34px] font-bold">Your classes</h1>
        </div>
        <Link href="/classes/new" className="btn btn-primary"><Plus aria-hidden size={18} /> Create a class</Link>
      </div>
      {classes.length === 0 ? (
        <div className="panel mt-6 text-[17px]">
          No classes yet. Create one to get learner aliases and private cards — no student names needed.
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {classes.map((c) => (
            <li key={c.class.id}>
              <Link href={`/classes/${c.class.id}`} className="panel block transition-shadow hover:shadow-md">
                <h2 className="text-[22px] font-bold">{c.class.title}</h2>
                <p className="mt-1 text-muted">
                  Grades {c.class.gradeBand} · {plural(c.learnerCount, "learner")} · {plural(c.sessionCount, "session")}
                </p>
                <p className="mt-3 text-[14px] text-muted">Last activity {dateLabel(c.lastActivityAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
