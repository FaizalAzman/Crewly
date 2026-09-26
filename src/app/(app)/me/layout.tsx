import { MeTabs } from "./me-tabs";
import { requireCtx } from "@/server/context";
import { EmptyState } from "@/components/ui";

const LINKS = [
  ["/me", "Overview"],
  ["/me/profile", "Profile"],
  ["/me/leave", "Leave"],
  ["/me/time", "Time & training"],
  ["/me/claims", "Claims & advances"],
  ["/me/payslips", "Payslips"],
  ["/me/tax", "Tax & reliefs"],
  ["/me/documents", "Documents"],
] as const;

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.employeeId) {
    return <EmptyState emoji="🤷" title="No employee profile linked" body="Your login isn't linked to an employee record. Ask HR to link it in Settings → Users." />;
  }
  return (
    <>
      <MeTabs links={LINKS} />
      {children}
    </>
  );
}
