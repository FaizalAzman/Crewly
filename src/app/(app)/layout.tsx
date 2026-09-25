import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { NAV } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { logoutAction } from "../(auth)/actions";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { countPendingApprovals } from "@/server/services/approvals.service";
import { MobileNotice } from "@/components/mobile-notice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = user.role as Role;

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(role, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );

  const [notifications, approvals] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    can(role, "leave.approve")
      ? countPendingApprovals({ tenantId: user.tenantId, userId: user.id, userName: user.name, role, employeeId: user.employeeId })
      : Promise.resolve(0),
  ]);

  async function markAllRead() {
    "use server";
    await prisma.notification.updateMany({ where: { userId: user!.id, read: false }, data: { read: true } });
    revalidatePath("/", "layout");
  }

  return (
    <div className="min-h-screen">
      <Sidebar groups={groups} badges={{ approvals }} tenantName={user.tenant.name} plan={user.tenant.plan} />
      <div className="lg:pl-64">
        <Topbar
          user={{ name: user.name, role: ROLE_LABEL[role], color: user.employee?.avatarColor ?? "#FFD23F", email: user.email }}
          notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
          markAllRead={markAllRead}
          logout={logoutAction}
          canSearch={can(role, "employee.view")}
        />
        <MobileNotice />
        <main className="bg-dots min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
