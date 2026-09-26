import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Callout, Card, CardBody, CardHeader, Field, Input, Money, PageHeader, PersonCell, Select, StatusBadge, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, ActionForm, FormModal, SubmitButton } from "@/components/forms";
import { redirect } from "next/navigation";
import { MIN_SEATS, PLANS, quoteFor, tenantAccess, type PlanKey } from "@/server/services/subscription.service";
import { LinkButton } from "@/components/ui";
import { assignableRoles } from "@/server/services/roles.service";
import { fmtDate, fmtTime, rm } from "@/lib/utils";
import { ROLE_LABEL, ROLES } from "@/lib/constants";
import { PERMISSION_CATALOG, ROLE_PERMISSIONS, ROLE_SCOPE, permissionLabel } from "@/lib/permissions";
import { activeAction, cancelSubscriptionAction, closeWorkspaceAction, deleteRoleAction, inviteAction, resetPasswordAction, roleAction, saveRoleAction, workspaceAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => ({ value: String(i), label: d }));

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; paid?: string }> }) {
  const ctx = await requireCtx();
  const manage = can(ctx, "settings.manage");
  const auditor = can(ctx, "audit.view");
  const billing = can(ctx, "billing.manage");
  if (!manage && !auditor && !billing) redirect("/me?denied=1");
  const sp = await searchParams;
  const paid = sp.paid === "1";
  const requested = sp.tab ?? (manage ? "workspace" : auditor ? "audit" : "billing");
  const allowed: Record<string, boolean> = { workspace: manage, users: manage, roles: manage, audit: auditor, privacy: manage, billing };
  const tab = allowed[requested] ? requested : manage ? "workspace" : auditor ? "audit" : "billing";
  const [tenant, users, logs, invoices, headcount, customRoles, roleOptions] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true, customRole: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.auditLog.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 150 }),
    prisma.invoice.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { issuedAt: "desc" } }),
    prisma.employee.count({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } }),
    prisma.customRole.findMany({ where: { tenantId: ctx.tenantId }, include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } }),
    assignableRoles(ctx),
  ]);
  const access = tenantAccess(tenant);

  return (
    <>
      <PageHeader title="Settings" emoji="⚙️" subtitle="Workspace policies, users and roles, audit trail and billing." />
      <Tabs
        active={tab}
        tabs={[
          ...(manage ? [{ key: "workspace", label: "Workspace", href: "/settings?tab=workspace" }, { key: "users", label: "Users", href: "/settings?tab=users", count: users.length }, { key: "roles", label: "Roles & permissions", href: "/settings?tab=roles", count: ROLES.length + customRoles.length }] : []),
          ...(auditor ? [{ key: "audit", label: "Audit log", href: "/settings?tab=audit" }] : []),
          ...(manage ? [{ key: "privacy", label: "Data & PDPA", href: "/settings?tab=privacy" }] : []),
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
        <Card>
          <CardHeader
            title="Users"
            emoji="👥"
            subtitle="Employees get logins from their profile. Invite people who aren't employees (accountants, auditors, consultants) here."
            action={
              <FormModal trigger="+ Invite user" triggerSize="sm" title="Invite a user" subtitle="If the email matches an employee without a login, the account is linked to them." action={inviteAction}>
                <Field label="Full name"><Input name="name" required /></Field>
                <Field label="Email"><Input type="email" name="email" required /></Field>
                <Field label="Role"><Select name="role" defaultValue="EMPLOYEE" options={roleOptions} /></Field>
                <Field label="Temporary password" hint="At least 8 characters. They can change it from Me → Profile."><Input name="password" defaultValue="Welcome2026!" required /></Field>
              </FormModal>
            }
          />
          <Table>
            <THead><tr><TH>User</TH><TH>Role</TH><TH>Employee link</TH><TH>Last login</TH><TH>Status</TH><TH /></tr></THead>
            <tbody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD><PersonCell name={u.name} sub={u.email} color={u.employee?.avatarColor} /></TD>
                  <TD>
                    {u.role === "CUSTOM" ? (
                      <Badge tone="pink">{u.customRole?.name ?? "Custom (deleted)"}</Badge>
                    ) : (
                      <Badge tone={u.role === "OWNER" ? "ink" : u.role === "HR_ADMIN" ? "purple" : u.role === "PAYROLL" ? "blue" : u.role === "MANAGER" ? "lime" : "gray"}>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</Badge>
                    )}
                  </TD>
                  <TD className="text-xs">{u.employee ? u.employee.fullName : <span className="text-muted">External user</span>}</TD>
                  <TD className="text-xs">{u.lastLoginAt ? `${fmtDate(u.lastLoginAt)} ${fmtTime(u.lastLoginAt)}` : "Never"}</TD>
                  <TD>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}</TD>
                  <TD className="text-right">
                    {u.id !== ctx.userId && (
                      <div className="flex justify-end gap-1">
                        <FormModal trigger="Role" triggerSize="sm" triggerVariant="secondary" title={`Change role · ${u.name}`} action={roleAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <Field label="Role"><Select name="role" defaultValue={u.role === "CUSTOM" ? `CUSTOM:${u.customRoleId}` : u.role} options={roleOptions} /></Field>
                        </FormModal>
                        <FormModal trigger="Password" triggerSize="sm" triggerVariant="secondary" title={`Reset password · ${u.name}`} action={resetPasswordAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <Field label="New temporary password" hint="At least 8 characters"><Input name="password" required minLength={8} /></Field>
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
      )}

      {tab === "roles" && (
        <div className="space-y-6">
          <Callout tone="sky" emoji="🔐">
            <b>Built-in roles</b> are fixed presets. Create <b>custom roles</b> for anything else, e.g. &quot;Branch HR&quot;, &quot;Finance viewer&quot; or &quot;Recruiter&quot;. Choose exactly which permissions a role has, and whether it sees the <b>whole company</b> or only the holder&apos;s <b>team</b> (their reporting line). You can&apos;t grant permissions you don&apos;t have yourself.
          </Callout>
          <div className="flex justify-end">
            <FormModal trigger="+ New custom role" title="New custom role" action={saveRoleAction} wide>
              <RoleFields />
            </FormModal>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customRoles.map((r) => {
              const perms = JSON.parse(r.permissions) as string[];
              return (
                <Card key={r.id}>
                  <CardHeader
                    title={r.name}
                    emoji="🧩"
                    subtitle={`${r.description ?? "Custom role"} · ${r._count.users} user(s)`}
                    action={<Badge tone={r.scope === "ALL" ? "purple" : "lime"}>{r.scope === "ALL" ? "Whole company" : "Own team"}</Badge>}
                  />
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {perms.map((p) => (
                        <Badge key={p} tone="gray">{permissionLabel(p)}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 border-t-2 border-dashed border-soft-line pt-3">
                      <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${r.name}`} action={saveRoleAction} wide>
                        <input type="hidden" name="id" value={r.id} />
                        <RoleFields role={{ name: r.name, description: r.description, permissions: perms, scope: r.scope }} />
                      </FormModal>
                      <ActionButton action={deleteRoleAction} fields={{ id: r.id }} variant="ghost" confirm={`Delete role "${r.name}"?`}>
                        Delete
                      </ActionButton>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
            {ROLES.map((r) => (
              <Card key={r}>
                <CardHeader
                  title={ROLE_LABEL[r]}
                  emoji="🔒"
                  subtitle={`Built-in · ${users.filter((u) => u.role === r).length} user(s)`}
                  action={<Badge tone={ROLE_SCOPE[r] === "ALL" ? "purple" : ROLE_SCOPE[r] === "TEAM" ? "lime" : "gray"}>{ROLE_SCOPE[r] === "ALL" ? "Whole company" : ROLE_SCOPE[r] === "TEAM" ? "Own team" : "Self only"}</Badge>}
                />
                <CardBody>
                  <div className="flex flex-wrap gap-1">
                    {ROLE_PERMISSIONS[r].length ? (
                      ROLE_PERMISSIONS[r].map((p) => (
                        <Badge key={p} tone="gray">{permissionLabel(p)}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted">Self-service only: own leave, claims, payslips and profile</span>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
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
        <div className="space-y-6">
          {paid && <Callout tone="lime" emoji="🎉">Payment received. Thank you! Your receipt is in the invoices below and was emailed to the owner.</Callout>}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card tone={access.writable ? "bg-lime" : "bg-cherry text-white"}>
              <CardHeader title={`${PLANS[tenant.plan as PlanKey]?.name ?? tenant.plan} plan`} emoji="💎" subtitle={`${tenant.billingCycle.toLowerCase()} billing`} />
              <CardBody className="space-y-2 text-sm">
                <p className="font-display text-2xl font-extrabold">{access.message || "Subscription active"}</p>
                {tenant.subscriptionStatus === "TRIALING" && tenant.trialEndsAt && <p>Trial ends {fmtDate(tenant.trialEndsAt, "long")}.</p>}
                {tenant.currentPeriodEnd && tenant.subscriptionStatus !== "TRIALING" && <p>Current period ends {fmtDate(tenant.currentPeriodEnd, "long")}.</p>}
                <p className="text-xs">Active employees: {headcount} · billed seats: {Math.max(MIN_SEATS, headcount)} (minimum {MIN_SEATS})</p>
                {tenant.subscriptionStatus === "ACTIVE" && (
                  <ActionButton action={cancelSubscriptionAction} fields={{}} variant="ghost" confirm="Cancel your subscription? You keep full access until the end of the paid period.">
                    Cancel subscription
                  </ActionButton>
                )}
              </CardBody>
            </Card>
            <div className="grid gap-4 md:grid-cols-3 lg:col-span-2">
              {(Object.keys(PLANS) as PlanKey[]).map((key) => {
                const p = PLANS[key];
                const monthly = quoteFor(key, headcount, "MONTHLY");
                const yearly = quoteFor(key, headcount, "YEARLY");
                const current = tenant.plan === key && tenant.subscriptionStatus === "ACTIVE";
                return (
                  <div key={key} className={`rounded-2xl border-2 border-ink p-4 shadow-brutal-sm ${current ? "bg-sky" : "bg-card"}`}>
                    <p className="font-display text-xl font-extrabold">{p.name}</p>
                    <p className="text-xs text-ink-2">
                      RM{p.price}/employee/month · {p.maxEmployees === Infinity ? "unlimited employees" : `up to ${p.maxEmployees} employees`} · {p.multiEntity ? "multiple entities" : "1 legal entity"}
                    </p>
                    <p className="font-display mt-3 text-2xl font-extrabold">{rm(monthly.total, { decimals: 0 })}<span className="text-xs font-bold">/mo incl. SST</span></p>
                    <p className="text-[11px] text-muted">or {rm(yearly.total, { decimals: 0 })}/yr (2 months free)</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      <LinkButton href={`/settings/checkout?plan=${key}&cycle=MONTHLY`} size="sm" variant={current ? "secondary" : "primary"}>{current ? "Renew" : "Monthly"}</LinkButton>
                      <LinkButton href={`/settings/checkout?plan=${key}&cycle=YEARLY`} size="sm" variant="secondary">Yearly</LinkButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Card>
            <CardHeader title="Invoices" emoji="🧾" />
            <Table>
              <THead><tr><TH>Invoice</TH><TH>Plan</TH><TH>Seats</TH><TH className="text-right">Amount</TH><TH className="text-right">SST</TH><TH>Status</TH><TH /></tr></THead>
              <tbody>
                {invoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-xs">{i.number}<span className="block text-muted">{fmtDate(i.issuedAt)}</span></TD>
                    <TD className="text-xs">{PLANS[i.plan as PlanKey]?.name ?? i.plan} · {i.cycle.toLowerCase()}</TD>
                    <TD>{i.seats}</TD>
                    <TD className="text-right"><Money value={i.amount} /></TD>
                    <TD className="text-right"><Money value={i.sst} /></TD>
                    <TD><StatusBadge status={i.status} /></TD>
                    <TD className="whitespace-nowrap text-right text-xs font-bold"><Link href={`/settings/invoices/${i.id}`} className="underline">View</Link> · <a href={`/api/pdf/invoice/${i.id}`} className="underline">PDF</a></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
          {ctx.role === "OWNER" && (
            <Card tone="bg-paper-2">
              <CardHeader title="Danger zone" emoji="⚠️" subtitle="Owner only" />
              <CardBody className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="font-bold">Export all data</p>
                  <p className="mb-2 text-xs text-ink-2">A JSON file with every employee, payslip, leave, claim and letter record (PDPA data portability).</p>
                  <a href="/api/export/workspace" className="inline-flex h-10 items-center rounded-xl border-2 border-ink bg-card px-4 text-sm font-bold">Download export</a>
                </div>
                <div>
                  <p className="font-bold">Close workspace</p>
                  <p className="mb-2 text-xs text-ink-2">Everyone loses access immediately. Data is kept for 30 days, during which support can restore it.</p>
                  <FormModal trigger="Close workspace…" triggerVariant="danger" title="Close workspace" subtitle="This signs everyone out." action={closeWorkspaceAction} submitLabel="Close it">
                    <Field label={`Type "${tenant.name}" to confirm`}><Input name="confirm" required /></Field>
                  </FormModal>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function RoleFields({ role }: { role?: { name: string; description: string | null; permissions: string[]; scope: string } }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Role name">
          <Input name="name" defaultValue={role?.name} required placeholder="Branch HR" />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <Input name="description" defaultValue={role?.description ?? ""} placeholder="HR for the Penang office" />
        </Field>
      </div>
      <Field label="Data scope" hint="Team = the holder's direct and indirect reports (needs a linked employee profile).">
        <Select name="scope" defaultValue={role?.scope ?? "TEAM"} options={[{ value: "TEAM", label: "Own team (reporting line)" }, { value: "ALL", label: "Whole company" }]} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(PERMISSION_CATALOG).map(([group, perms]) => (
          <fieldset key={group} className="rounded-xl border-2 border-ink p-3">
            <legend className="px-1 text-xs font-extrabold uppercase tracking-wider">{group}</legend>
            <div className="space-y-1.5">
              {Object.entries(perms).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={key} defaultChecked={role?.permissions.includes(key)} className="mt-0.5 h-4 w-4" />
                  <span>
                    {label}
                    <span className="block font-mono text-[10px] text-muted">{key}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
