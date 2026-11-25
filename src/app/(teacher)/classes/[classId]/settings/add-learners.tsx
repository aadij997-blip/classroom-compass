"use client";
import { useActionState } from "react";
import { addLearnersAction } from "@/app/actions";
import { FormStatus, SubmitButton } from "@/components/forms";
import { CardSheet } from "@/components/cards";

export function AddLearners({ classId, title }: { classId: string; title: string }) {
  const [state, action] = useActionState(addLearnersAction, null);
  return (
    <>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="classId" value={classId} />
        <label>
          <span className="field-label">How many</span>
          <input className="input w-[120px]" type="number" name="count" min={1} max={20} defaultValue={1} />
        </label>
        <SubmitButton className="btn btn-secondary">Add learners</SubmitButton>
        <FormStatus state={state} />
      </form>
      {state?.ok && state.cards && <CardSheet cards={state.cards} title={title} />}
    </>
  );
}
