"use client";
// Printable learner access cards. Tokens are shown only right after they are
// issued; the server keeps only hashes, so reprinting means issuing new cards.

import type { Card } from "@/app/actions";

export function CardSheet({ cards, title }: { cards: Card[]; title: string }) {
  return (
    <section aria-label="Learner cards ready to print" className="mt-6">
      <div className="no-print panel-quiet mb-4 text-[15px]">
        <strong>Print or save these now.</strong> For privacy, links are shown only once. If a card is lost, issue a new one for that learner — the old link stops working.
        <div className="mt-3">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print {cards.length} card{cards.length === 1 ? "" : "s"}</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {cards.map((c) => (
          <article key={c.learnerId} className="print-avoid rounded-[18px] border-2 border-dashed border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">{title}</p>
                <p className="text-[22px] font-bold">{c.alias}</p>
                <p className="mt-1 text-[13px] text-muted">Scan or open your private link. Keep this card to yourself.</p>
              </div>
              <div className="w-[104px] flex-none" aria-hidden dangerouslySetInnerHTML={{ __html: c.qrSvg }} />
            </div>
            <p className="mt-2 break-all font-mono text-[11px] text-ink">{c.url}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
