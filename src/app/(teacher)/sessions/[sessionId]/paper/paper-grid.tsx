"use client";
// Fast keyboard paper entry. A cell holds a printed letter, "-" (left blank on
// paper), or "" (no sheet entered). Rows save when focus leaves them, and the
// status shows "Saved" only after the server confirms.

import { useRef, useState } from "react";
import { savePaperAction } from "@/app/actions";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface GridItem {
  itemId: string;
  answers: Record<string, string>;
  reasons: Record<string, string>;
}
export interface GridRow {
  learnerId: string;
  alias: string;
  cells: Record<string, string>;
  fromDevice: boolean;
}
type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string };

export function PaperGrid({ runId, items, rows, disabled }: { runId: string; items: GridItem[]; rows: GridRow[]; disabled: boolean }) {
  const cols = items.flatMap((it, i) => [
    { key: `${it.itemId}:a`, label: `Q${i + 1} answer`, letters: Object.keys(it.answers) },
    { key: `${it.itemId}:r`, label: `Q${i + 1} reason`, letters: Object.keys(it.reasons) },
  ]);
  const [cells, setCells] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(rows.map((r) => [r.learnerId, { ...r.cells }])));
  const saved = useRef<Record<string, Record<string, string>>>(Object.fromEntries(rows.map((r) => [r.learnerId, { ...r.cells }])));
  // Mirror of `cells` updated synchronously: a row can blur (and save) before React re-renders.
  const live = useRef<Record<string, Record<string, string>>>(Object.fromEntries(rows.map((r) => [r.learnerId, { ...r.cells }])));
  const setCell = (lid: string, key: string, val: string) => {
    live.current = { ...live.current, [lid]: { ...live.current[lid], [key]: val } };
    setCells(live.current);
  };
  const [status, setStatus] = useState<Record<string, Status>>({});
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const dirtyIn = (src: Record<string, Record<string, string>>, lid: string) => cols.some((c) => (src[lid]?.[c.key] ?? "") !== (saved.current[lid]?.[c.key] ?? ""));
  const dirty = (lid: string) => dirtyIn(cells, lid);

  async function saveRow(lid: string) {
    if (!dirtyIn(live.current, lid) || disabled) return;
    const row = live.current[lid];
    const entries = items
      .map((it) => {
        const a = row[`${it.itemId}:a`] ?? "";
        const r = row[`${it.itemId}:r`] ?? "";
        const before = saved.current[lid];
        if (a === (before[`${it.itemId}:a`] ?? "") && r === (before[`${it.itemId}:r`] ?? "")) return null;
        if (a === "" && r === "") return { learnerId: lid, itemId: it.itemId, answerId: null, reasonId: null, clear: true };
        return {
          learnerId: lid,
          itemId: it.itemId,
          answerId: a && a !== "-" ? it.answers[a] : null,
          reasonId: r && r !== "-" ? it.reasons[r] : null,
        };
      })
      .filter((e): e is NonNullable<typeof e> => !!e);
    setStatus((s) => ({ ...s, [lid]: { kind: "saving" } }));
    const snapshot = { ...row };
    try {
      const res = await savePaperAction(runId, entries);
      if (res?.ok) {
        saved.current[lid] = snapshot;
        setStatus((s) => ({ ...s, [lid]: { kind: "saved" } }));
      } else {
        setStatus((s) => ({ ...s, [lid]: { kind: "error", message: res?.message } }));
      }
    } catch {
      setStatus((s) => ({ ...s, [lid]: { kind: "error", message: "No connection. Your typing is kept — try again." } }));
    }
  }

  function focusCell(ri: number, ci: number) {
    const r = rows[Math.max(0, Math.min(rows.length - 1, ri))];
    const c = cols[Math.max(0, Math.min(cols.length - 1, ci))];
    refs.current[`${r.learnerId}|${c.key}`]?.focus();
    refs.current[`${r.learnerId}|${c.key}`]?.select();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) {
    const lid = rows[ri].learnerId;
    const col = cols[ci];
    const k = e.key;
    if (k === "ArrowRight") { e.preventDefault(); focusCell(ri, ci + 1); return; }
    if (k === "ArrowLeft") { e.preventDefault(); focusCell(ri, ci - 1); return; }
    if (k === "ArrowDown" || k === "Enter") { e.preventDefault(); focusCell(ri + 1, ci); return; }
    if (k === "ArrowUp") { e.preventDefault(); focusCell(ri - 1, ci); return; }
    if (k === "Backspace" || k === "Delete") {
      e.preventDefault();
      setCell(lid, col.key, "");
      return;
    }
    // Printable characters arrive through onChange (works for keyboards, IMEs, and assistive tech).
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>, ri: number, ci: number) {
    const lid = rows[ri].learnerId;
    const col = cols[ci];
    const raw = e.target.value.trim();
    if (raw === "") {
      setCell(lid, col.key, "");
      return;
    }
    const up = raw.slice(-1).toUpperCase();
    if (up === "-" || col.letters.includes(up)) {
      setCell(lid, col.key, up);
      if (ci < cols.length - 1) focusCell(ri, ci + 1);
      else focusCell(ri + 1, 0);
    }
  }

  const dirtyRows = rows.filter((r) => dirty(r.learnerId));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={disabled || dirtyRows.length === 0} onClick={() => dirtyRows.forEach((r) => saveRow(r.learnerId))}>
          Save {dirtyRows.length ? `${dirtyRows.length} changed row${dirtyRows.length === 1 ? "" : "s"}` : "changes"}
        </button>
        <span className="text-[14px] text-muted" aria-live="polite">
          {Object.values(status).filter((s) => s.kind === "error").length > 0 ? "Some rows did not save — see the row status." : ""}
        </span>
      </div>
      <div className="overflow-auto rounded-2xl border border-line bg-white" role="region" aria-label="Paper entry grid" tabIndex={-1} style={{ maxHeight: "70vh" }}>
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th scope="col">Learner</th>
              {cols.map((c) => <th key={c.key} scope="col" className="text-center">{c.label}</th>)}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const st = status[r.learnerId];
              return (
                <tr
                  key={r.learnerId}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) saveRow(r.learnerId);
                  }}
                >
                  <th scope="row" className="!static whitespace-nowrap !text-[15px] !text-ink">
                    {r.alias}
                    {r.fromDevice && <span className="block text-[12px] font-normal text-muted">has device answers</span>}
                  </th>
                  {cols.map((c, ci) => (
                    <td key={c.key} className="text-center">
                      <input
                        ref={(el) => { refs.current[`${r.learnerId}|${c.key}`] = el; }}
                        aria-label={`${r.alias}, ${c.label}`}
                        value={cells[r.learnerId]?.[c.key] ?? ""}
                        onChange={(e) => onInput(e, ri, ci)}
                        onKeyDown={(e) => onKey(e, ri, ci)}
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={disabled}
                        inputMode="text"
                        autoComplete="off"
                        className={`h-11 w-12 rounded-lg border text-center text-[18px] font-bold uppercase ${cells[r.learnerId]?.[c.key] === "-" ? "border-line bg-neutral text-muted" : "border-[rgb(26_31_20/0.28)] bg-white"}`}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-[13px]">
                    {st?.kind === "saving" && <span className="inline-flex items-center gap-1 text-muted"><Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" /> Saving…</span>}
                    {st?.kind === "saved" && !dirty(r.learnerId) && <span className="inline-flex items-center gap-1 font-semibold text-forest"><CheckCircle2 aria-hidden size={14} /> Saved</span>}
                    {st?.kind === "error" && (
                      <span className="inline-flex items-center gap-2 font-semibold text-red">
                        <AlertCircle aria-hidden size={14} /> {st.message ?? "Not saved"}
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => saveRow(r.learnerId)}>Retry</button>
                      </span>
                    )}
                    {dirty(r.learnerId) && st?.kind !== "saving" && st?.kind !== "error" && <span className="text-muted">Not saved yet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
