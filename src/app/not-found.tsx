import Link from "next/link";
import { btnClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="bg-dots flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border-2 border-ink bg-card p-8 text-center shadow-brutal">
        <div className="mb-3 text-4xl" aria-hidden>
          🧭
        </div>
        <h1 className="font-display text-2xl font-extrabold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-muted">It may have moved, or the link is out of date.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard" className={btnClass("primary")}>
            Go to dashboard
          </Link>
          <Link href="/" className={btnClass("secondary")}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
