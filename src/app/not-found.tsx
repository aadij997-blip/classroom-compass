import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] px-4 py-20 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-2 text-[30px] font-bold">We couldn’t find that page</h1>
      <p className="mt-2 text-muted">It may have been deleted, or it belongs to a different account.</p>
      <Link href="/today" className="btn btn-primary mt-6">Go to Today</Link>
    </div>
  );
}
