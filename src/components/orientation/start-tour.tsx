"use client";
// Starts the sample walkthrough. Inside the sample it just restarts the tour
// (no reseed). Elsewhere it enters the sample via the server, reusing any
// existing sample, without touching the teacher's sign-in.

import { startTourAction } from "@/app/actions";
import { saveTour } from "@/lib/orientation/storage";
import { useOrientation } from "./provider";

export function StartTourButton({ children, className = "btn btn-secondary", tourKey }: { children: React.ReactNode; className?: string; tourKey?: string }) {
  const o = useOrientation();
  if (o?.ctx.isDemo) {
    return (
      <button type="button" className={className} onClick={() => o.restartInSample()}>
        {children}
      </button>
    );
  }
  const key = o?.ctx.tourKey ?? tourKey ?? "anonymous";
  return (
    <form action={startTourAction} onSubmit={() => saveTour(key, { status: "touring", step: 0 })} className="contents">
      <button className={className}>{children}</button>
    </form>
  );
}
