"use client";
import { ContextHelp } from "@/components/orientation/context-help";
import { ORIENTATION } from "@/lib/orientation";
import Link from "next/link";
import { useActionState } from "react";
import { createClassAction } from "@/app/actions";
import { FormStatus, SubmitButton } from "@/components/forms";
import { CardSheet } from "@/components/cards";
import { ArrowRight } from "lucide-react";

export default function NewClassPage() {
  const [state, action] = useActionState(createClassAction, null);
  if (state?.ok && state.cards && state.classId) {
    return (
      <div>
        <div className="no-print">
          <p className="eyebrow">New class</p>
          <h1 className="mt-2 text-[32px] font-bold">Class saved. Print the learner cards.</h1>
          <p className="mt-2 max-w-[62ch] text-[17px]">
            Each card has a private link and QR code for one learner alias. Learners never type names or emails. You can print new cards later from the class page.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/sessions/new?classId=${state.classId}`} className="btn btn-primary">Set up a session <ArrowRight aria-hidden size={18} /></Link>
            <Link href={`/classes/${state.classId}`} className="btn btn-secondary">Go to the class</Link>
          </div>
        </div>
        <CardSheet cards={state.cards} title="Classroom Compass" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[640px]">
      <p className="eyebrow">New class</p>
      <h1 className="mt-2 text-[32px] font-bold">Create a class</h1>
      <p className="mt-2 text-muted">Learners get numbered aliases such as “Learner 01”. Keep any name list on paper, outside this app.</p>
      <ContextHelp id="new_class" auto title={ORIENTATION.contextual_help.new_class.title} className="mt-4">{ORIENTATION.contextual_help.new_class.body}</ContextHelp>
      <form action={action} className="panel mt-6 space-y-5" data-tour="new-class-form">
        <label className="block">
          <span className="field-label">Class name</span>
          <input className="input" name="title" required maxLength={80} placeholder="e.g. Room 12 — Period 3" />
        </label>
        <label className="block">
          <span className="field-label">Grade band</span>
          <select className="input" name="gradeBand" defaultValue="4–6">
            <option value="4–6">Grades 4–6</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
            <option value="6">Grade 6</option>
          </select>
        </label>
        <label className="block">
          <span className="field-label">Number of learners</span>
          <input className="input max-w-[160px]" type="number" name="learnerCount" min={1} max={60} defaultValue={24} required />
          <span className="field-hint">You can add more later. Table groups are optional and set up on the class page.</span>
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton>Create class and cards</SubmitButton>
          <FormStatus state={state} />
        </div>
      </form>
    </div>
  );
}
