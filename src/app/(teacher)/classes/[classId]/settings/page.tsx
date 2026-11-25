import Link from "next/link";
import { requireTeacher } from "@/lib/server/context";
import { loadClass } from "@/lib/server/views";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { deleteClassAction, deleteGroupAction, saveGroupAction } from "@/app/actions";
import { AddLearners } from "./add-learners";

export default async function SettingsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const t = await requireTeacher();
  const b = await loadClass(t, classId);

  const groupForm = (g?: (typeof b.groups)[number]) => (
    <ActionForm action={saveGroupAction} resetOnSuccess={!g} className="space-y-3">
      <input type="hidden" name="classId" value={b.class.id} />
      {g && <input type="hidden" name="groupId" value={g.id} />}
      <label className="block max-w-[320px]">
        <span className="field-label">Group label</span>
        <input className="input" name="label" defaultValue={g?.label} placeholder="e.g. Table 3" maxLength={40} required />
      </label>
      <fieldset>
        <legend className="field-label">Who sits here (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {b.learners.map((l) => (
            <label key={l.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 has-[:checked]:border-forest has-[:checked]:bg-pale">
              <input type="checkbox" name="learnerId" value={l.id} defaultChecked={g?.learnerIds.includes(l.id)} className="h-4 w-4 accent-[#14532d]" />
              <span className="text-[15px]">{l.alias}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton className="btn btn-secondary">{g ? "Save group" : "Add group"}</SubmitButton>
    </ActionForm>
  );

  return (
    <div className="max-w-[960px]">
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/classes" className="hover:underline">Classes</Link> / <Link href={`/classes/${b.class.id}`} className="hover:underline">{b.class.title}</Link> / <span>Groups & settings</span>
      </nav>
      <h1 className="mt-3 text-[32px] font-bold">Groups & settings</h1>

      <section className="panel mt-6">
        <h2 className="text-[20px] font-bold">Table groups</h2>
        <p className="mt-1 text-[15px] text-muted">
          Groups are seating, not ability levels. Group observations stay with the group and never become individual results.
        </p>
        <div className="mt-4 space-y-6">
          {b.groups.map((g) => (
            <details key={g.id} className="rounded-2xl border border-line p-4">
              <summary className="cursor-pointer font-semibold">{g.label} <span className="font-normal text-muted">· {g.learnerIds.length} learners</span></summary>
              <div className="mt-4">{groupForm(g)}</div>
              <ActionForm action={deleteGroupAction} className="mt-2">
                <input type="hidden" name="classId" value={b.class.id} />
                <input type="hidden" name="groupId" value={g.id} />
                <ConfirmButton className="btn btn-sm btn-danger" message={`Remove ${g.label}? Observations about this group are removed too.`}>Remove group</ConfirmButton>
              </ActionForm>
            </details>
          ))}
          <div className="rounded-2xl bg-neutral p-4">{groupForm()}</div>
        </div>
      </section>

      <section className="panel mt-6">
        <h2 className="text-[20px] font-bold">Add learners</h2>
        <p className="mt-1 text-[15px] text-muted">New learners continue the numbering and get their own cards.</p>
        <AddLearners classId={b.class.id} title={b.class.title} />
      </section>

      <section className="mt-6 rounded-[22px] border border-red/30 bg-white p-6">
        <h2 className="text-[20px] font-bold text-red">Delete this class</h2>
        <p className="mt-1 text-[15px]">
          Permanently removes the class, its learners, responses, observations, reviews, and teaching actions, and turns off every learner card. This cannot be undone.
        </p>
        <ActionForm action={deleteClassAction} className="mt-4 space-y-3">
          <input type="hidden" name="classId" value={b.class.id} />
          <label className="block max-w-[420px]">
            <span className="field-label">Type the class name to confirm: <span className="font-normal">{b.class.title}</span></span>
            <input className="input" name="confirm" autoComplete="off" required />
          </label>
          <ConfirmButton message="Delete this class and all of its records permanently?">Delete class permanently</ConfirmButton>
        </ActionForm>
      </section>
    </div>
  );
}
