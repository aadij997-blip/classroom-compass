import Link from "next/link";
import { allModules } from "@/lib/content";
import { ConceptArt } from "@/components/art";

export const metadata = { title: "Teaching ideas" };

export default function TeachingIdeasPage() {
  return (
    <div>
      <p className="eyebrow">Teaching ideas</p>
      <h1 className="mt-2 text-[34px] font-bold">Short activities to try together</h1>
      <p className="mt-2 max-w-[65ch] text-muted">Each one takes about six or seven minutes, uses tokens or cards you already have, and ends with fresh questions to check again. Use them any time — you don’t need responses first.</p>
      <ul className="mt-6 grid gap-5 md:grid-cols-3">
        {allModules().map((m) => (
          <li key={m.id}>
            <Link href={`/teaching-ideas/${m.activity.id}`} className="panel flex h-full flex-col transition-shadow hover:shadow-md">
              <div className="grid place-items-center rounded-2xl bg-pale py-4"><ConceptArt conceptId={m.id} className="w-[150px]" /></div>
              <span className="cue cue-blush mt-4 self-start">Day {m.curriculum_day} · {m.activity.minutes} minutes</span>
              <h2 className="mt-2 text-[22px] font-bold">{m.activity.title}</h2>
              <p className="mt-1 text-[15px] text-muted">{m.title}: {m.goal}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
