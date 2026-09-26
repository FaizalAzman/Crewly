"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MeTabs({ links }: { links: readonly (readonly [string, string])[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="My pages" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border-2 border-ink bg-card p-1 shadow-brutal-sm">
      {links.map(([href, label]) => {
        const active = href === "/me" ? pathname === "/me" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-bold", active ? "bg-ink text-paper" : "hover:bg-paper-2")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
