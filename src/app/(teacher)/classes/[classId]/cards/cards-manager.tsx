"use client";
import { useActionState } from "react";
import { issueCardsAction, revokeCardAction } from "@/app/actions";
import { CardSheet } from "@/components/cards";
import { ActionForm, ConfirmButton, FormStatus, SubmitButton } from "@/components/forms";

export function CardsManager({ classId, title, learners }: { classId: string; title: string; learners: { id: string; alias: string; hasAccess: boolean }[] }) {
  const [state, action] = useActionState(issueCardsAction, null);
  return (
    <div>
      <div className="no-print mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <form action={action} className="panel">
          <h2 className="text-[20px] font-bold">Print cards for the whole class</h2>
          <p className="mt-1 text-[15px] text-muted">Replaces every learner’s current card.</p>
          <input type="hidden" name="classId" value={classId} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {learners.some((l) => l.hasAccess) ? (
              <ConfirmButton className="btn btn-primary" message="Create new cards for everyone? Cards already handed out will stop working.">
                Create {learners.length} new cards
              </ConfirmButton>
            ) : (
              <SubmitButton pendingLabel="Creating…">Create {learners.length} new cards</SubmitButton>
            )}
            <FormStatus state={state} savedLabel="Cards ready" />
          </div>
        </form>
        <div className="panel">
          <h2 className="text-[20px] font-bold">One learner at a time</h2>
          <p className="mt-1 text-[15px] text-muted">Replace a lost card, or turn a card off.</p>
          <div className="mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-line" role="region" aria-label="Learner card status" tabIndex={0}>
            <table className="table">
              <thead>
                <tr><th scope="col">Learner</th><th scope="col">Card</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {learners.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.alias}</td>
                    <td>{l.hasAccess ? <span className="cue cue-green !text-[13px]">Working</span> : <span className="cue cue-neutral !text-[13px]">Off / not issued</span>}</td>
                    <td className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <form action={action}>
                          <input type="hidden" name="classId" value={classId} />
                          <input type="hidden" name="learnerId" value={l.id} />
                          <SubmitButton className="btn btn-sm btn-secondary" pendingLabel="…">New card</SubmitButton>
                        </form>
                        {l.hasAccess && (
                          <ActionForm action={revokeCardAction} statusPosition="none">
                            <input type="hidden" name="classId" value={classId} />
                            <input type="hidden" name="learnerId" value={l.id} />
                            <ConfirmButton className="btn btn-sm btn-danger" message={`Turn off ${l.alias}'s card? Their link will stop working immediately.`}>Turn off</ConfirmButton>
                          </ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {state?.ok && state.cards && <CardSheet cards={state.cards} title={title} />}
    </div>
  );
}
