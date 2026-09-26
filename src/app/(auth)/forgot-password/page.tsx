import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="bg-dots flex min-h-screen flex-col p-6 md:p-10">
      <Logo />
      <div className="mx-auto w-full max-w-md py-16">
        <h1 className="font-display text-4xl font-extrabold">Forgot your password?</h1>
        <p className="mt-2 text-ink-2">Enter your work email and we&apos;ll send a link to set a new one. It&apos;s valid for 1 hour.</p>
        <div className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brutal-lg">
          <ForgotForm />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-bold underline">← Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
