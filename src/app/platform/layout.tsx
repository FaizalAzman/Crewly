import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/server/context";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: { default: "Platform console", template: "%s · Crewly platform" } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.platformAdmin) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-ink text-paper">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Logo href="/platform" light />
          <span className="rounded-full border-2 border-lime px-2 text-[10px] font-extrabold uppercase tracking-widest text-lime">Operator console</span>
          <nav className="flex gap-4 text-sm font-bold">
            <Link href="/platform" className="hover:underline">Workspaces</Link>
            <Link href="/platform/emails" className="hover:underline">Email outbox</Link>
          </nav>
          <div className="flex-1" />
          <span className="text-xs text-paper/70">{user.name}</span>
          <Link href="/dashboard" className="text-xs font-bold underline">Back to app</Link>
        </div>
      </header>
      <main className="bg-dots mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
