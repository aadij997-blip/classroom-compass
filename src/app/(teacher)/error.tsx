"use client";

export default function TeacherError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel mx-auto max-w-[600px]" role="alert">
      <h1 className="text-[24px] font-bold">Something went wrong loading this page</h1>
      <p className="mt-2">Nothing you saved earlier has been lost. Try again, or go back to Today.</p>
      <div className="mt-4 flex gap-3">
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <a className="btn btn-secondary" href="/today">Go to Today</a>
      </div>
    </div>
  );
}
