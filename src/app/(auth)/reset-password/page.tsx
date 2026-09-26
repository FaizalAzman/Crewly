import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/logo";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { hashToken } from "@/server/services/auth.service";
import { resetAction } from "../password-actions";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; invite?: string }> }) {
  const sp = await searchParams;
  const row = sp.token ? await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(sp.token) }, include: { user: { include: { tenant: true } } } }) : null;
  const valid = row && !row.usedAt && row.expiresAt > new Date();
  return (
    <div className="bg-dots flex min-h-screen flex-col p-6 md:p-10">
      <Logo />
      <div className="mx-auto w-full max-w-md py-16">
        {valid ? (
          <>
            <h1 className="font-display text-4xl font-extrabold">{sp.invite ? `Welcome to ${row.user.tenant.name}!` : "Set a new password"}</h1>
            <p className="mt-2 text-ink-2">
              {sp.invite ? "Choose a password to activate your account" : "Choose a new password for"} <b>{row.user.email}</b>.
            </p>
            <div className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brutal-lg">
              <ActionForm action={resetAction} resetOnSuccess={false} className="space-y-4">
                <input type="hidden" name="token" value={sp.token} />
                <Field label="New password" hint="At least 8 characters">
                  <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <Input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
                </Field>
                <SubmitButton className="w-full" size="lg">
                  {sp.invite ? "Activate account" : "Save password"}
                </SubmitButton>
              </ActionForm>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold">This link has expired</h1>
            <p className="mt-2 text-ink-2">Reset links are single-use and valid for 1 hour (invitations for 7 days).</p>
            <p className="mt-6">
              <Link href="/forgot-password" className="font-bold underline">Request a new link →</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
