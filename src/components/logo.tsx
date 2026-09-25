import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export function Logo({ className, href = "/", light }: { className?: string; href?: string; light?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)}>
      <span className="font-display relative flex h-9 w-9 -rotate-6 items-center justify-center rounded-xl border-2 border-ink bg-lime text-lg font-extrabold shadow-brutal-sm transition group-hover:rotate-0">
        {BRAND.name[0]}
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-ink bg-tangerine" />
      </span>
      <span className={cn("font-display text-xl font-extrabold tracking-tight", light && "text-paper")}>
        {BRAND.wordmark[0]}
        <span className={light ? "text-lime" : "text-grape"}>{BRAND.wordmark[1]}</span>
      </span>
    </Link>
  );
}
