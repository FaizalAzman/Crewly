import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCtx, getSessionUser } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { APPROVAL_PERMISSIONS, NAV } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { logoutAction } from "../(auth)/actions";
import { countPendingApprovals } from "@/server/services/approvals.service";
import { MobileNotice } from "@/components/mobile-notice";
import { tenantAccess } from "@/server/services/subscription.service";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const ctx = await getCtx();
  if (!user || !ctx) redirect("/login");

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || (Array.isArray(i.permission) ? i.permission.some((p) => can(ctx, p)) : can(ctx, i.permission))) })).filter(
    (g) => g.items.length > 0,
  );

  const [notifications, approvals] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    APPROVAL_PERMISSIONS.some((p) => can(ctx, p)) ? countPendingApprovals(ctx) : Promise.resolve(0),
  ]);

  async function markAllRead() {
    "use server";
    await prisma.notification.updateMany({ where: { userId: user!.id, read: false }, data: { read: true } });
    revalidatePath("/", "layout");
  }

  return (
    <div className="min-h-screen">
      <Sidebar groups={groups} badges={{ approvals }} tenantName={user.tenant.name} plan={user.tenant.plan} />
      <div className="print-shell lg:pl-64 print:pl-0">
        <Topbar
          user={{ name: user.name, role: ctx.roleLabel, color: user.employee?.avatarColor ?? "#FFD23F", email: user.email }}
          notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
          markAllRead={markAllRead}
          logout={logoutAction}
          canSearch={can(ctx, "employee.view")}
        />
        <MobileNotice />
        {(() => {
          const a = tenantAccess(user.tenant);
          const billingHref = can(ctx, "billing.manage") ? "/settings?tab=billing" : null;
          if (a.state === "TRIAL" && a.daysLeft !== null)
            return (
              <div className="no-print flex flex-wrap items-center justify-center gap-2 border-b-2 border-ink bg-sunny px-4 py-1.5 text-center text-xs font-bold">
                🎁 {a.message}.
                {billingHref && <Link href={billingHref} className="underline">Choose a plan →</Link>}
              </div>
            );
          if (!a.writable || a.state === "CANCELLED_GRACE")
            return (
              <div className={`no-print flex flex-wrap items-center justify-center gap-2 border-b-2 border-ink px-4 py-2 text-center text-sm font-bold ${a.writable ? "bg-sunny" : "bg-cherry text-white"}`}>
                {a.writable ? "⏳" : "🔒"} {a.message}
                {billingHref ? <Link href={billingHref} className="underline">Subscribe now →</Link> : <span>Ask your workspace owner to renew.</span>}
              </div>
            );
          return null;
        })()}
        {user.platformAdmin && (
          <div className="no-print border-b-2 border-ink bg-ink px-4 py-1 text-center text-xs font-bold text-paper">
            🛠️ You are a Crewly operator. <Link href="/platform" className="text-lime underline">Open the platform console →</Link>
          </div>
        )}
        <main className="print-shell bg-dots min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
