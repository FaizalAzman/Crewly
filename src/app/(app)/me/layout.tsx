import Link from "next/link";
import { requireCtx } from "@/server/context";
import { EmptyState } from "@/components/ui";

const LINKS = [
  ["/me", "Overview"],
  ["/me/leave", "Leave"],
  ["/me/claims", "Claims & advances"],
  ["/me/payslips", "Payslips"],
  ["/me/tax", "Tax & reliefs"],
];

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.employeeId) {
    return <EmptyState emoji="🤷" title="No employee profile linked" body="Your login isn't linked to an employee record. Ask HR to link it in Settings → Users." />;
  }
  return (
    <>
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border-2 border-ink bg-card p-1 shadow-brutal-sm">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-bold hover:bg-paper-2">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
