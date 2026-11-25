"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Re-reads collection counts while a check is open. Teacher can pause it. */
export function LiveRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [last, setLast] = useState<Date | null>(null);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      router.refresh();
      setLast(new Date());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);
  return (
    <div className="flex flex-wrap items-center gap-3 text-[14px] text-muted">
      <span aria-live="polite">{on ? `Updating every ${seconds} seconds${last ? ` · last ${last.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}` : "Updates paused"}</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOn((v) => !v)}>
        {on ? "Pause updates" : "Resume updates"}
      </button>
    </div>
  );
}
