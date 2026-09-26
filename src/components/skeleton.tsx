import { cn } from "@/lib/utils";

/** A grey placeholder block. Pulses only when the user allows motion. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-soft-line/70 motion-safe:animate-pulse", className)} />;
}

/**
 * Generic page skeleton shown instantly on navigation (via loading.tsx) while the server renders the page.
 * Mirrors the common layout: header, a row of stat cards, then a table card.
 */
export function PageSkeleton({ stats = 4, rows = 6 }: { stats?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-8 w-56" />
          <Bone className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Bone className="h-10 w-32 rounded-xl" />
      </div>
      {stats > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal">
              <Bone className="mb-3 h-3 w-24" />
              <Bone className="h-7 w-16" />
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border-2 border-ink bg-card shadow-brutal">
        <div className="border-b-2 border-ink p-4">
          <Bone className="h-5 w-40" />
        </div>
        <div className="divide-y divide-soft-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Bone className="h-8 w-8 shrink-0 rounded-full" />
              <Bone className="h-4 flex-1" />
              <Bone className="hidden h-4 w-24 sm:block" />
              <Bone className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
