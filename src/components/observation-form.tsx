"use client";
import { useState } from "react";
import { addObservationAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export function ObservationForm({
  classId,
  sessionId,
  conceptId,
  learners,
  groups,
  categories,
  supports,
  enrolled,
}: {
  classId: string;
  sessionId: string | null;
  conceptId: string;
  learners: { id: string; alias: string }[];
  groups: { id: string; label: string; size: number }[];
  categories: { id: string; label: string }[];
  supports: string[];
  enrolled: number;
}) {
  const [scope, setScope] = useState<"class" | "group" | "individual">("class");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <ActionForm action={addObservationAction} resetOnSuccess savedLabel="Observation saved" className="space-y-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="sessionId" value={sessionId ?? ""} />
      <input type="hidden" name="conceptId" value={conceptId} />
      <fieldset>
        <legend className="field-label">Who is this about?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["class", "Whole class"],
              ["group", "A table group"],
              ["individual", "One learner"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="choice !min-h-11 !py-2">
              <input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} />
              <span className="font-semibold">{l}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">
          {scope === "individual"
            ? "Adds context to this learner’s timeline. It does not change their answers."
            : "Stays with the group or class. It never becomes an individual result."}
        </p>
      </fieldset>
      {scope === "group" &&
        (groups.length ? (
          <label className="block max-w-[320px]">
            <span className="field-label">Group</span>
            <select className="input" name="groupId" required>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.size})</option>)}
            </select>
          </label>
        ) : (
          <p className="panel-quiet text-[15px]">No table groups yet. Add them from the class’s Groups & settings page.</p>
        ))}
      {scope === "individual" && (
        <label className="block max-w-[320px]">
          <span className="field-label">Learner</span>
          <select className="input" name="learnerId" required>
            {learners.map((l) => <option key={l.id} value={l.id}>{l.alias}</option>)}
          </select>
        </label>
      )}
      <label className="block max-w-[420px]">
        <span className="field-label">What did you notice?</span>
        <select className="input" name="category" required>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {scope !== "individual" && (
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="field-label">Tally (optional)</span>
            <input className="input w-[120px]" type="number" name="tally" min={0} />
          </label>
          <span className="pb-3">out of</span>
          <label>
            <span className="field-label">Counted</span>
            <input className="input w-[120px]" type="number" name="denominator" min={1} defaultValue={scope === "class" ? enrolled : groups[0]?.size || ""} />
          </label>
        </div>
      )}
      <fieldset>
        <legend className="field-label">Supports used (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {supports.map((s) => (
            <label key={s} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-[15px] has-[:checked]:border-forest has-[:checked]:bg-pale">
              <input type="checkbox" name="supports" value={s} className="h-4 w-4 accent-[#14532d]" /> {s}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="field-label">Short note</span>
        <textarea className="input min-h-[84px]" name="note" maxLength={600} placeholder="What you saw or heard — avoid names." />
      </label>
      <label className="block max-w-[220px]">
        <span className="field-label">Date</span>
        <input className="input" type="date" name="observedOn" defaultValue={today} required />
      </label>
      <SubmitButton className="btn btn-secondary">Save observation</SubmitButton>
    </ActionForm>
  );
}
