"use client";
// Minimal learner flow: one question per screen, save as you go, then send.
// Never shows correctness: the answer key is not in this page at all.

import { useEffect, useState } from "react";
import { submitAnswers } from "./actions";
import type { StudentItem } from "@/lib/content/schema";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Answer = { answerId: string | null; reasonId: string | null; confidence: "sure" | "somewhat_sure" | "unsure" | null; explanation: string | null };

function newId() {
  return `sub_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function CheckFlow({
  alias,
  checkRunId,
  title,
  items,
  existing,
  art,
}: {
  alias: string;
  checkRunId: string;
  title: string;
  items: StudentItem[];
  existing: Record<string, Answer>;
  art: React.ReactNode;
}) {
  const alreadyDone = items.every((i) => existing[i.id]?.answerId && existing[i.id]?.reasonId);
  const [step, setStep] = useState<number>(alreadyDone ? items.length + 1 : -1);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(items.map((i) => [i.id, existing[i.id] ?? { answerId: null, reasonId: null, confidence: null, explanation: null }])),
  );
  const [pendingId, setPendingId] = useState(newId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = (itemId: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [itemId]: { ...a[itemId], ...patch } }));

  async function save(itemIds: string[], then: () => void) {
    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const res = await submitAnswers({
        checkRunId,
        submissionId: pendingId,
        answers: itemIds.map((id) => ({ itemId: id, ...answers[id], explanation: answers[id].explanation?.trim() || null })),
      });
      if (res.ok) {
        setPendingId(newId());
        setSavedNote("Saved");
        then();
      } else if (res.code === "closed") {
        setClosed(true);
      } else {
        setError(res.message);
      }
    } catch {
      setError("Your answers were not saved. Check your connection and press Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <div className="rounded-[24px] bg-pale p-6 text-center">
        <h1 className="text-[26px] font-bold">This check is closed</h1>
        <p className="mt-2 text-[18px]">Your teacher has stopped collecting answers. Anything you saved before is kept.</p>
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="rounded-[24px] bg-pale p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[16px] text-forest">Hi, {alias}!</p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight">{title}</h1>
          </div>
          {art}
        </div>
        <p className="mt-4 text-[19px]">Two quick questions. For each one, pick an answer and the reason that best explains it.</p>
        <p className="mt-2 text-[17px] text-forest">This is about your thinking, not a test. It’s OK to choose “I am not sure.”</p>
        <button type="button" className="btn btn-primary mt-6 w-full text-[19px]" onClick={() => setStep(0)}>Start</button>
      </div>
    );
  }

  if (step === items.length + 1) {
    return (
      <div className="rounded-[24px] bg-pale p-6 text-center" role="status">
        <CheckCircle2 aria-hidden size={48} className="mx-auto text-forest" />
        <h1 className="mt-3 text-[28px] font-bold">Your answers are in. Thank you!</h1>
        <p className="mt-2 text-[18px]">Your teacher will talk through these together. You can change your answers until the check is closed.</p>
        <button type="button" className="btn btn-secondary mt-6" onClick={() => setStep(0)}>Change my answers</button>
      </div>
    );
  }

  const progress = (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[15px] text-muted">
        <span>{step < items.length ? `Question ${step + 1} of ${items.length}` : "Check your answers"}</span>
        {savedNote && !busy && (
          <span className="inline-flex items-center gap-1 font-semibold text-forest" role="status"><CheckCircle2 aria-hidden size={16} /> {savedNote}</span>
        )}
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {[...items, null].map((_, i) => <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? "bg-forest" : "bg-neutral"}`} />)}
      </div>
    </div>
  );

  const errorBox = error && (
    <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-blush px-4 py-3 text-terracotta">
      <AlertCircle aria-hidden size={20} className="mt-0.5 flex-none" />
      <span className="text-[16px] font-semibold">{error}</span>
    </div>
  );

  if (step === items.length) {
    return (
      <div>
        {progress}
        <h1 className="text-[26px] font-bold">Check your answers</h1>
        <ul className="mt-4 space-y-3">
          {items.map((it, i) => {
            const a = answers[it.id];
            return (
              <li key={it.id} className="rounded-2xl border border-line bg-white p-4 text-[17px]">
                <p className="font-semibold">Question {i + 1}</p>
                <p>Answer: {it.answerOptions.find((o) => o.id === a.answerId)?.letter}. {it.answerOptions.find((o) => o.id === a.answerId)?.text}</p>
                <p>Reason: {it.reasonOptions.find((o) => o.id === a.reasonId)?.letter}. {it.reasonOptions.find((o) => o.id === a.reasonId)?.text}</p>
                <button type="button" className="link mt-1 text-[15px]" onClick={() => setStep(i)}>Change</button>
              </li>
            );
          })}
        </ul>
        {errorBox}
        <button type="button" className="btn btn-primary mt-6 w-full text-[19px]" disabled={busy} onClick={() => save(items.map((i) => i.id), () => setStep(items.length + 1))}>
          {busy ? <><Loader2 aria-hidden size={18} className="animate-spin motion-reduce:animate-none" /> Sending…</> : error ? "Try again" : "Send my answers"}
        </button>
      </div>
    );
  }

  const it = items[step];
  const a = answers[it.id];
  const ready = !!a.answerId && !!a.reasonId;
  return (
    <div>
      {progress}
      <p className="text-[19px] leading-relaxed">{it.scenario}</p>
      <fieldset className="mt-4">
        <legend className="text-[22px] font-bold leading-snug">{it.question}</legend>
        <div className="mt-3 space-y-2">
          {it.answerOptions.map((o) => (
            <label key={o.id} className="choice">
              <input type="radio" name={`answer-${it.id}`} value={o.id} checked={a.answerId === o.id} onChange={() => set(it.id, { answerId: o.id })} />
              <span className="choice-letter" aria-hidden>{o.letter}</span>
              <span className="pt-0.5 text-[18px]">{o.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-[20px] font-bold">{it.reasonPrompt}</legend>
        <div className="mt-3 space-y-2">
          {it.reasonOptions.map((o) => (
            <label key={o.id} className="choice">
              <input type="radio" name={`reason-${it.id}`} value={o.id} checked={a.reasonId === o.id} onChange={() => set(it.id, { reasonId: o.id })} />
              <span className="choice-letter" aria-hidden>{o.letter}</span>
              <span className="pt-0.5 text-[18px]">{o.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-[17px] font-semibold">How sure are you? <span className="font-normal text-muted">(optional)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["sure", "Sure"],
              ["somewhat_sure", "Somewhat sure"],
              ["unsure", "Unsure"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="choice !min-h-11 !rounded-full !px-4 !py-2">
              <input type="radio" name={`conf-${it.id}`} value={v} checked={a.confidence === v} onChange={() => set(it.id, { confidence: v })} />
              <span className="text-[16px] font-semibold">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="mt-5" open={!!a.explanation}>
        <summary className="cursor-pointer text-[17px] font-semibold text-forest">Explain your thinking in a sentence (optional)</summary>
        <label className="mt-2 block">
          <span className="sr-only">Your explanation</span>
          <textarea className="input min-h-[90px] text-[17px]" maxLength={400} value={a.explanation ?? ""} onChange={(e) => set(it.id, { explanation: e.target.value })} />
        </label>
      </details>
      {errorBox}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>
        )}
        <button type="button" className="btn btn-primary flex-1 text-[19px]" disabled={!ready || busy} onClick={() => save([it.id], () => setStep(step + 1))}>
          {busy ? <><Loader2 aria-hidden size={18} className="animate-spin motion-reduce:animate-none" /> Saving…</> : error ? "Try again" : "Save and continue"}
        </button>
      </div>
      {!ready && <p className="mt-2 text-[15px] text-muted">Pick an answer and a reason to continue.</p>}
    </div>
  );
}
