import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";
import { BRAND } from "@/lib/brand";
import { MobileNotice } from "@/components/mobile-notice";

export const metadata: Metadata = { title: "Log in" };

const DEMO = [
  { label: "HR Admin", email: `aisyah@${BRAND.demoDomain}`, emoji: "🧑‍💼" },
  { label: "Payroll", email: `meiling@${BRAND.demoDomain}`, emoji: "💰" },
  { label: "Manager", email: `raj@${BRAND.demoDomain}`, emoji: "🧑‍🏫" },
  { label: "Employee", email: `danial@${BRAND.demoDomain}`, emoji: "🙋" },
];

export default function LoginPage() {
  return (
    <div className="bg-dots grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-6 md:p-10">
        <Logo />
        <MobileNotice variant="public" />
        <div className="mx-auto w-full max-w-md py-10">
          <h1 className="font-display text-4xl font-extrabold">Welcome back 👋</h1>
          <p className="mt-2 text-ink-2">Log in to your workspace to pick up where you left off.</p>
          <div className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brutal-lg">
            <ActionForm action={loginAction} resetOnSuccess={false} className="space-y-4">
              <Field label="Work email">
                <Input name="email" type="email" required placeholder="you@company.my" defaultValue={DEMO[0].email} />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" required placeholder="••••••••" defaultValue="demo1234" />
              </Field>
              <SubmitButton className="w-full" size="lg" pendingText="Signing you in…">
                Log in →
              </SubmitButton>
            </ActionForm>
          </div>
          <div className="mt-6 rounded-2xl border-2 border-dashed border-ink bg-paper-2 p-4">
            <p className="text-xs font-bold uppercase tracking-wider">🎮 Demo accounts · password: demo1234</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <div key={d.email} className="rounded-xl border-2 border-ink bg-card px-3 py-2 text-xs">
                  <div className="font-bold">
                    {d.emoji} {d.label}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted">{d.email}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-center text-sm">
            New here?{" "}
            <Link href="/signup" className="font-bold underline decoration-tangerine decoration-2 underline-offset-4">
              Start a free 14-day trial
            </Link>
          </p>
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} {BRAND.company}</p>
      </div>
      <div className="relative hidden overflow-hidden border-l-2 border-ink bg-grape lg:block">
        <div className="absolute inset-0 flex flex-col justify-center p-14 text-white">
          <div className="max-w-md space-y-5">
            {[
              { e: "🧮", t: "Statutory, sorted", s: "PCB, EPF, SOCSO and EIS calculated to the sen, every month." },
              { e: "🌴", t: "Leave by the book", s: "Employment Act 1955 entitlements with state public holidays built in." },
              { e: "⚡", t: "One-tap approvals", s: "Leave, claims and overtime cleared from a single inbox." },
            ].map((f, i) => (
              <div
                key={f.t}
                className="rounded-2xl border-2 border-ink bg-card p-5 text-ink shadow-brutal-lg"
                style={{ transform: `rotate(${[-2, 1.5, -1][i]}deg)` }}
              >
                <div className="text-3xl">{f.e}</div>
                <div className="font-display mt-2 text-xl font-extrabold">{f.t}</div>
                <div className="text-sm text-ink-2">{f.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
