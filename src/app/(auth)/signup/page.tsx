import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import { STATES } from "@/lib/constants";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Start free trial" };

export default function SignupPage() {
  return (
    <div className="bg-dots min-h-screen p-6 md:p-10">
      <Logo />
      <div className="mx-auto mt-10 grid max-w-5xl items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="pt-6">
          <div className="inline-block -rotate-2 rounded-lg border-2 border-ink bg-sunny px-3 py-1 text-xs font-bold uppercase shadow-brutal-sm">
            14 days free · no credit card
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold leading-[1.05]">
            Your HR, set up in <span className="highlighter">minutes</span>.
          </h1>
          <ul className="mt-8 space-y-3 text-ink-2">
            {[
              "🇲🇾 Malaysian statutory rules preloaded: EPF, SOCSO, EIS, PCB and HRD Corp",
              "📅 2026 federal and state public holidays included",
              "🌴 Employment Act leave types and entitlements configured",
              "📝 Letter templates, onboarding checklists and policies ready to use",
            ].map((t) => (
              <li key={t} className="flex gap-2 font-medium">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border-2 border-ink bg-card p-7 shadow-brutal-lg">
          <h2 className="font-display text-2xl font-extrabold">Create your workspace</h2>
          <ActionForm action={signupAction} resetOnSuccess={false} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Company name" className="sm:col-span-2" required>
              <Input name="companyName" required placeholder="Acme Technologies Sdn Bhd" />
            </Field>
            <Field label="Your name" required>
              <Input name="name" required placeholder="Your full name" />
            </Field>
            <Field label="Work email" required>
              <Input name="email" type="email" required placeholder="you@company.my" />
            </Field>
            <Field label="HQ state">
              <Select name="state" defaultValue="SELANGOR" options={STATES.map((s) => ({ value: s.code, label: s.name }))} />
            </Field>
            <Field label="Headcount">
              <Input name="headcount" type="number" min={1} defaultValue={25} />
            </Field>
            <Field label="Password" className="sm:col-span-2" hint="At least 8 characters.">
              <Input name="password" type="password" required minLength={8} />
            </Field>
            <SubmitButton className="sm:col-span-2" size="lg" variant="lime" pendingText="Setting up your workspace…">
              Create workspace →
            </SubmitButton>
          </ActionForm>
          <p className="mt-5 text-center text-sm">
            Already have one?{" "}
            <Link href="/login" className="font-bold underline decoration-grape decoration-2 underline-offset-4">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
