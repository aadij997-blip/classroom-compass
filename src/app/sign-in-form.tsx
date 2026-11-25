"use client";
import { useActionState, useState } from "react";
import { signInAction } from "@/app/actions";
import { FormStatus, SubmitButton } from "@/components/forms";

export function SignInForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="mt-5 space-y-4">
      <div role="tablist" aria-label="Account" className="inline-flex rounded-xl bg-neutral p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-10 rounded-lg px-4 text-[15px] font-semibold ${mode === m ? "bg-white shadow-sm" : "text-muted"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <input type="hidden" name="intent" value={mode} />
      {mode === "signup" && (
        <label className="block">
          <span className="field-label">Your name (learners never see it)</span>
          <input className="input" name="displayName" autoComplete="name" maxLength={60} />
        </label>
      )}
      <label className="block">
        <span className="field-label">Email</span>
        <input className="input" type="email" name="email" required autoComplete="email" />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input className="input" type="password" name="password" required minLength={10} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {mode === "signup" && <span className="field-hint">At least 10 characters.</span>}
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-dark" pendingLabel={mode === "signin" ? "Signing in…" : "Creating…"}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
