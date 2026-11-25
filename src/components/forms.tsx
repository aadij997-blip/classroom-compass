"use client";
// "Saved" appears only after the server action confirms persistence.

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export type ActionResult = { ok: boolean; message?: string; at?: number } | null;
export type FormAction = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "btn btn-primary",
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} aria-disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 aria-hidden size={16} className="animate-spin motion-reduce:animate-none" /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function FormStatus({ state, savedLabel = "Saved" }: { state: ActionResult; savedLabel?: string }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="text-sm text-muted" role="status">Saving…</span>;
  if (!state) return <span role="status" className="sr-only" />;
  if (state.ok)
    return (
      <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
        <CheckCircle2 aria-hidden size={16} /> {state.message ?? savedLabel}
      </span>
    );
  return (
    <span role="alert" className="inline-flex items-center gap-1 text-sm font-semibold text-red">
      <AlertCircle aria-hidden size={16} /> {state.message ?? "That did not save. Please try again."}
    </span>
  );
}

/** A form bound to a server action that reports Saving… / Saved / error inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  savedLabel,
  statusPosition = "end",
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  savedLabel?: string;
  statusPosition?: "end" | "none";
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {statusPosition === "end" && (
        <div className="mt-2 min-h-6">
          <FormStatus state={state} savedLabel={savedLabel} />
        </div>
      )}
    </form>
  );
}

export function ConfirmButton({ children, message, className = "btn btn-danger" }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
