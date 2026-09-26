import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { Guide } from "@/server/services/guide.service";
import { ActionButton } from "./forms";
import { Progress } from "./ui";
import { dismissGuideAction } from "@/app/(app)/help/actions";

/** First-login checklist for invited users. Steps tick themselves off from real data. */
export function GettingStarted({ guide }: { guide: Guide }) {
  if (!guide.visible) return null;
  return (
    <section aria-labelledby="getting-started" className="mb-6 rounded-2xl border-2 border-ink bg-card p-5 shadow-brutal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="font-display text-lg font-extrabold">
            👋 Getting started
          </h2>
          <p className="text-sm text-muted">
            A few things to set up so Crewly works for you. {guide.done} of {guide.total} done ·{" "}
            <Link href="/help" className="font-bold underline">
              How-to guides
            </Link>
          </p>
        </div>
        <ActionButton action={dismissGuideAction} fields={{}} variant="ghost">
          Hide
        </ActionButton>
      </div>
      <Progress value={guide.percent} className="mt-3" />
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {guide.steps.map((s) => (
          <li key={s.key} className={`flex gap-3 rounded-xl border-2 p-3 ${s.done ? "border-soft-line bg-paper-2" : "border-ink bg-card"}`}>
            {s.done ? <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={18} aria-label="Done" /> : <Circle className="mt-0.5 shrink-0 text-muted" size={18} aria-label="To do" />}
            <div className="min-w-0">
              <p className={`text-sm font-bold ${s.done ? "text-muted line-through" : ""}`}>{s.title}</p>
              <p className="text-xs text-muted">{s.why}</p>
              {!s.done && (
                <Link href={s.href} className="mt-1 inline-block text-xs font-bold underline">
                  {s.cta} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
