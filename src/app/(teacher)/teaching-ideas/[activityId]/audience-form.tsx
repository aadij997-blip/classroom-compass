"use client";
import { useActionState, useState } from "react";
import { decideActionAction } from "@/app/actions";
import { FormStatus, SubmitButton } from "@/components/forms";

export function AudienceForm(props: {
  sessionId: string;
  runId: string;
  activityId: string;
  recKey: string;
  evidence: string;
  suggested: string[];
  learners: { id: string; alias: string }[];
  groups: { id: string; label: string; size: number }[];
}) {
  const [state, action] = useActionState(decideActionAction, null);
  const [audience, setAudience] = useState<"whole_class" | "small_group" | "individual">("whole_class");
  return (
    <form action={action} className="mt-3 space-y-4">
      {(["sessionId", "runId", "activityId", "recKey", "evidence"] as const).map((k) => (
        <input key={k} type="hidden" name={k} value={props[k]} />
      ))}
      <fieldset>
        <legend className="sr-only">Audience</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["whole_class", "Whole class", "Everyone does the activity together."],
              ["small_group", "A table group", "Use an existing seating group."],
              ["individual", "Selected learners", props.suggested.length ? `${props.suggested.length} learners showed this pattern on the check.` : "Choose learners yourself."],
            ] as const
          ).map(([v, l, d]) => (
            <label key={v} className="choice !flex-col !gap-1">
              <input type="radio" name="audience" value={v} checked={audience === v} onChange={() => setAudience(v)} />
              <span className="font-semibold">{l}</span>
              <span className="text-[14px] text-muted">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {audience === "small_group" &&
        (props.groups.length ? (
          <label className="block max-w-[320px]">
            <span className="field-label">Group</span>
            <select name="groupId" className="input">
              {props.groups.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.size})</option>)}
            </select>
          </label>
        ) : (
          <p className="panel-quiet text-[15px]">No table groups yet — add them from the class’s Groups & settings page, or choose another audience.</p>
        ))}
      {audience === "individual" && (
        <fieldset>
          <legend className="field-label">Learners</legend>
          <p className="field-hint mb-2">Pre-selected: learners whose completed check showed this pattern. Learners without a completed check are not added automatically — that would be guessing.</p>
          <div className="flex flex-wrap gap-2">
            {props.learners.map((l) => (
              <label key={l.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-[15px] has-[:checked]:border-forest has-[:checked]:bg-pale">
                <input type="checkbox" name="learnerId" value={l.id} defaultChecked={props.suggested.includes(l.id)} className="h-4 w-4 accent-[#14532d]" /> {l.alias}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="field-label">Your note (optional)</span>
        <input className="input" name="note" maxLength={300} placeholder="e.g. Tomorrow after warm-up; use pre-counted tokens" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton name="decision" value="accepted">Use this plan</SubmitButton>
        <SubmitButton className="btn btn-secondary" name="decision" value="dismissed" pendingLabel="Saving…">Not now — dismiss</SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
