import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Callout, Card, CardBody, CardHeader, Field, Input, Money, PageHeader, PersonCell, Select, StatusBadge, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, ActionForm, FormModal, SubmitButton } from "@/components/forms";
import { act } from "@/server/action";
import { changePlan, changeUserRole, quote, setUserActive, updateWorkspace, PLAN_PRICES } from "@/server/services/settings.service";
import { fmtDate, fmtTime, numField, rm, str } from "@/lib/utils";
import { ROLE_LABEL, ROLES } from "@/lib/constants";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Settings" };

async function workspaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await updateWorkspace(ctx, {
      name: str(fd, "name"),
      workDaysPerWeek: numField(fd, "workDaysPerWeek", 5),
      restDay: numField(fd, "restDay"),
      offDay: str(fd, "offDay") === "" ? null : numField(fd, "offDay"),
      payrollCutoff: numField(fd, "payrollCutoff", 25),
      payDay: numField(fd, "payDay", 28),
      unpaidLeaveBasis: str(fd, "unpaidLeaveBasis"),
      mileageRate: numField(fd, "mileageRate", 0.6),
      lateGraceMinutes: numField(fd, "lateGraceMinutes", 10),
    });
    revalidatePath("/", "layout");
    return "Settings saved";
  });
}

async function roleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await changeUserRole(ctx, str(fd, "userId"), str(fd, "role"));
    revalidatePath("/settings");
    return "Role updated";
  });
}

async function activeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await setUserActive(ctx, str(fd, "userId"), str(fd, "active") === "true");
    revalidatePath("/settings");
    return "User updated";
  });
}

async function planAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("billing.manage");
  return act(async () => {
    await changePlan(ctx, str(fd, "plan"), str(fd, "cycle") as "MONTHLY");
    revalidatePath("/", "layout");
    return "Plan updated";
  });
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => ({ value: String(i), label: d }));

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("settings.manage");
  const tab = (await searchParams).tab ?? "workspace";
  const [tenant, users, logs, invoices, headcount] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.auditLog.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 150 }),
    prisma.invoice.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { issuedAt: "desc" } }),
    prisma.employee.count({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } }),
  ]);
  const billing = can(ctx.role, "billing.manage");
  const q = quote(tenant.plan, headcount, tenant.billingCycle as "MONTHLY");

  return (
    <>
      <PageHeader title="Settings" emoji="⚙️" subtitle="Workspace policies, users and roles, audit trail and billing." />
      <Tabs
        active={tab}
        tabs={[
          { key: "workspace", label: "Workspace", href: "/settings?tab=workspace" },
          { key: "users", label: "Users & roles", href: "/settings?tab=users", count: users.length },
          { key: "audit", label: "Audit log", href: "/settings?tab=audit" },
          { key: "privacy", label: "Data & PDPA", href: "/settings?tab=privacy" },
          ...(billing ? [{ key: "billing", label: "Plan & billing", href: "/settings?tab=billing" }] : []),
        ]}
      />

      {tab === "workspace" && (
        <Card>
          <CardHeader title="Workspace policies" emoji="🏠" subtitle="These drive leave day-counting, payroll proration, OT day-types and lateness." />
          <CardBody>
            <ActionForm action={workspaceAction} resetOnSuccess={false} className="grid gap-4 md:grid-cols-3">
              <Field label="Workspace name" className="md:col-span-3"><Input name="name" defaultValue={tenant.name} /></Field>
              <Field label="Work week"><Select name="workDaysPerWeek" defaultValue={String(tenant.workDaysPerWeek)} options={[{ value: "5", label: "5 days" }, { value: "5.5", label: "5.5 days (half-day Saturday)" }, { value: "6", label: "6 days" }]} /></Field>
              <Field label="Rest day (EA s.59)" hint="Kedah, Kelantan & Terengganu typically use Friday"><Select name="restDay" defaultValue={String(tenant.restDay)} options={DAYS} /></Field>
              <Field label="Off day"><Select name="offDay" defaultValue={tenant.offDay === null ? "" : String(tenant.offDay)} placeholder="None" options={DAYS} /></Field>
              <Field label="Payroll cut-off (day)"><Input type="number" name="payrollCutoff" defaultValue={tenant.payrollCutoff} /></Field>
              <Field label="Pay day" hint="EA s.19: within 7 days of the wage period"><Input type="number" name="payDay" defaultValue={tenant.payDay} /></Field>
              <Field label="Unpaid leave / proration basis"><Select name="unpaidLeaveBasis" defaultValue={tenant.unpaidLeaveBasis} options={[{ value: "WORKING_DAYS", label: "Working days in month" }, { value: "CALENDAR_DAYS", label: "Calendar days in month" }, { value: "FIXED_26", label: "Fixed 26 days (ORP)" }]} /></Field>
              <Field label="Mileage rate (RM/km)"><Input type="number" step="0.01" name="mileageRate" defaultValue={tenant.mileageRate} /></Field>
              <Field label="Late grace (minutes)"><Input type="number" name="lateGraceMinutes" defaultValue={tenant.lateGraceMinutes} /></Field>
              <div className="flex items-end justify-end md:col-span-3"><SubmitButton>Save settings</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {tab === "users" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Users" emoji="👥" subtitle="Create logins from an employee's profile." />
            <Table>
              <THead><tr><TH>User</TH><TH>Role</TH><TH>Last login</TH><TH>Status</TH><TH /></tr></THead>
              <tbody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD><PersonCell name={u.name} sub={u.email} color={u.employee?.avatarColor} /></TD>
                    <TD><Badge tone={u.role === "OWNER" ? "ink" : u.role === "HR_ADMIN" ? "purple" : u.role === "PAYROLL" ? "blue" : u.role === "MANAGER" ? "lime" : "gray"}>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</Badge></TD>
                    <TD className="text-xs">{u.lastLoginAt ? `${fmtDate(u.lastLoginAt)} ${fmtTime(u.lastLoginAt)}` : "Never"}</TD>
                    <TD>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}</TD>
                    <TD className="text-right">
                      {u.id !== ctx.userId && (
                        <div className="flex justify-end gap-1">
                          <FormModal trigger="Role" triggerSize="sm" triggerVariant="secondary" title={`Change role · ${u.name}`} action={roleAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <Field label="Role"><Select name="role" defaultValue={u.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
                          </FormModal>
                          <ActionButton action={activeAction} fields={{ userId: u.id, active: String(!u.active) }} variant={u.active ? "ghost" : "lime"} confirm={u.active ? `Disable ${u.name}'s login?` : undefined}>
                            {u.active ? "Disable" : "Enable"}
                          </ActionButton>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Role permissions" emoji="🔐" />
            <CardBody className="space-y-3 text-xs">
              {ROLES.map((r) => (
                <div key={r}>
                  <p className="font-bold">{ROLE_LABEL[r]} <span className="text-muted">({ROLE_PERMISSIONS[r].length})</span></p>
                  <p className="text-ink-2">{ROLE_PERMISSIONS[r].length ? ROLE_PERMISSIONS[r].join(", ") : "Self-service only"}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader title="Audit log" emoji="🕵️" subtitle="Who did what, and when. Includes logins and exports of personal data." />
          <Table>
            <THead><tr><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Entity</TH><TH>Summary</TH></tr></THead>
            <tbody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap font-mono text-[11px]">{fmtDate(l.createdAt)} {fmtTime(l.createdAt)}</TD>
                  <TD className="text-xs font-semibold">{l.userName}</TD>
                  <TD><StatusBadge status={l.action === "APPROVE" ? "APPROVED" : l.action === "REJECT" ? "REJECTED" : l.action === "EXPORT" ? "WAITING" : "DRAFT"} /> <span className="text-[10px] font-bold">{l.action}</span></TD>
                  <TD className="text-xs">{l.entity}</TD>
                  <TD className="text-xs">{l.summary}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "privacy" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="PDPA 2010 compliance" emoji="🛡️" />
            <CardBody className="space-y-3 text-sm">
              <p>✅ Personal data is only visible to roles with <code>employee.sensitive</code> (Owner, HR Admin, Payroll). MyKad numbers are masked for everyone else.</p>
              <p>✅ Every export of personal data is recorded in the audit log.</p>
              <p>✅ Employees can view and correct their own data from the Me page (Access and Correction principles).</p>
              <p>✅ A PDPA notice is issued to every employee as a policy requiring acknowledgement.</p>
              <p>✅ Logins of former employees are deactivated when separation completes (Retention principle).</p>
            </CardBody>
          </Card>
          <Callout emoji="🗄️">
            <b>Retention guidance:</b> keep payroll and tax records for at least <b>7 years</b> (Income Tax Act s.82), and employment records for at least <b>6 years</b> (Employment Act s.61 and the related regulations). Then securely delete personal data that&apos;s no longer needed.
          </Callout>
        </div>
      )}

      {tab === "billing" && billing && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1" tone="bg-lime">
            <CardHeader title={`${tenant.plan[0] + tenant.plan.slice(1).toLowerCase()} plan`} emoji="💎" subtitle={`${tenant.billingCycle.toLowerCase()} billing`} />
            <CardBody className="space-y-2 text-sm">
              <p className="font-display text-4xl font-extrabold">{rm(q.total)}</p>
              <p>{q.billable} seats × {rm(q.price, { decimals: 0 })}{tenant.billingCycle === "YEARLY" ? " × 10 months" : ""} + 8% SST ({rm(q.sst)})</p>
              <p className="text-xs">Active employees: {headcount} · minimum 10 seats</p>
              <FormModal trigger="Change plan" triggerVariant="primary" title="Change plan" action={planAction}>
                <Field label="Plan"><Select name="plan" defaultValue={tenant.plan} options={Object.entries(PLAN_PRICES).map(([p, v]) => ({ value: p, label: `${p[0] + p.slice(1).toLowerCase()} · RM${v}/employee/mo` }))} /></Field>
                <Field label="Billing cycle"><Select name="cycle" defaultValue={tenant.billingCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly (2 months free)" }]} /></Field>
              </FormModal>
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Invoices" emoji="🧾" />
            <Table>
              <THead><tr><TH>Invoice</TH><TH>Period</TH><TH>Seats</TH><TH className="text-right">Amount</TH><TH className="text-right">SST</TH><TH>Status</TH></tr></THead>
              <tbody>
                {invoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-xs">{i.number}</TD>
                    <TD>{i.period}</TD>
                    <TD>{i.seats}</TD>
                    <TD className="text-right"><Money value={i.amount} /></TD>
                    <TD className="text-right"><Money value={i.sst} /></TD>
                    <TD><StatusBadge status={i.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
