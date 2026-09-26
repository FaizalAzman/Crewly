"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton, type ActionState } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../password-actions";

export function ForgotForm() {
  const [state, action] = useActionState<ActionState, FormData>(forgotAction, null);
  const devLink = (state?.data as { devLink?: string } | null)?.devLink;
  if (state?.ok)
    return (
      <div className="space-y-3">
        <p className="rounded-xl border-2 border-ink bg-lime px-3 py-2 text-sm font-bold">📬 {state.message}</p>
        {devLink && (
          <p className="rounded-xl border-2 border-dashed border-ink bg-paper-2 px-3 py-2 text-xs">
            Development mode (no email provider): <Link href={devLink} className="font-bold underline">open the reset link</Link>
          </p>
        )}
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="text-sm font-semibold text-cherry">⚠️ {state.error}</p>}
      <Field label="Work email">
        <Input name="email" type="email" required placeholder="you@company.my" />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
