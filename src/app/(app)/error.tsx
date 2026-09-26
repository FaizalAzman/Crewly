"use client";

import { useEffect } from "react";
import Link from "next/link";
import { btnClass } from "@/components/ui";

/** Keeps the sidebar and top bar usable when one page fails, and offers a retry. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-2xl border-2 border-ink bg-card p-8 text-center shadow-brutal">
      <div className="mb-3 text-4xl" aria-hidden>
        🛠️
      </div>
      <h1 className="font-display text-2xl font-extrabold">This page hit a snag</h1>
      <p className="mt-2 text-sm text-muted">
        Nothing was lost. Try again, or head back to your dashboard.
        {error.digest && <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className={btnClass("primary")}>
          Try again
        </button>
        <Link href="/dashboard" className={btnClass("secondary")}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
