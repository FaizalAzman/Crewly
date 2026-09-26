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
        <main className="print-shell bg-dots min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
