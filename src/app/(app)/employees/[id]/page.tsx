import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Callout, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, KV, LinkButton, Money, Progress, Select, StatusBadge, Table, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { ageOn, fmtDate, rm, todayMY } from "@/lib/utils";
import { humanize, ROLES, stateName } from "@/lib/constants";
import { maskNric } from "@/lib/nric";
import { serviceYears } from "@/lib/statutory/employment-act";
import { childReliefTotal, pcbCategory } from "@/lib/statutory/pcb";
import { calcEpf } from "@/lib/statutory/epf";
import { calcEis, calcSocso } from "@/lib/statutory/socso";
import { available } from "@/server/services/leave.service";
import { addChildAction, addDocumentAction, addRecurringPayAction, confirmAction, createLoginAction, extendProbationAction, removeChildAction, removeRecurringPayAction } from "../actions";

const TABS = ["overview", "job", "pay", "family", "documents", "leave", "payslips", "history", "assets"] as const;

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("employee.view");
  const { id } = await params;
  const tab = ((await searchParams).tab ?? "overview") as (typeof TABS)[number];
  const e = await prisma.employee.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      company: true,
      branch: true,
      department: true,
      position: true,
      grade: true,
      manager: { select: { id: true, fullName: true, avatarColor: true, jobTitle: true } },
      reports: { select: { id: true, fullName: true, avatarColor: true, jobTitle: true, status: true } },
      user: true,
      children: { orderBy: { dateOfBirth: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { effectiveDate: "desc" } },
      payItems: { include: { payItem: true } },
      assets: true,
      permits: true,
    },
  });
  if (!e) notFound();
  const sensitive = can(ctx.role, "employee.sensitive") || ctx.employeeId === e.id;
  const manage = can(ctx.role, "employee.manage");
  const today = todayMY();
  const years = serviceYears(e.joinDate, today);
  const age = ageOn(e.dateOfBirth, today);

  return (
    <>
      <div className="mb-6 flex flex-col gap-5 rounded-3xl border-2 border-ink bg-card p-6 shadow-brutal md:flex-row md:items-center">
        <Avatar name={e.fullName} color={e.avatarColor} size={84} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-extrabold">{e.fullName}</h1>
            <StatusBadge status={e.status} />
            {e.citizenship !== "CITIZEN" && <Badge tone="blue">{e.citizenship === "PR" ? "PR" : `🌏 ${e.nationality}`}</Badge>}
          </div>
          <p className="mt-1 text-ink-2">
            {e.jobTitle} · {e.department?.name ?? "No department"} · {e.branch?.name ?? e.company.name}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {e.employeeNo} · {e.email} · {e.phone ?? "no phone"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && (
            <LinkButton href={`/employees/${e.id}/edit`} variant="secondary">
              <Pencil size={14} /> Edit
            </LinkButton>
          )}
          {manage && e.status === "PROBATION" && (
            <>
              <FormModal trigger="Confirm 🎉" triggerVariant="lime" title="Confirm employment" action={confirmAction} submitLabel="Confirm">
                <input type="hidden" name="id" value={e.id} />
                <Field label="Confirmation date">
                  <Input type="date" name="date" defaultValue={today.toISOString().slice(0, 10)} />
                </Field>
              </FormModal>
              <FormModal trigger="Extend probation" triggerVariant="secondary" title="Extend probation" action={extendProbationAction} submitLabel="Extend">
                <input type="hidden" name="id" value={e.id} />
                <Field label="Extend by (months)">
                  <Select name="months" defaultValue="1" options={["1", "2", "3", "6"].map((m) => ({ value: m, label: `${m} month(s)` }))} />
                </Field>
              </FormModal>
            </>
          )}
        </div>
      </div>

      <Tabs active={tab} tabs={TABS.filter((t) => sensitive || !["pay", "payslips"].includes(t)).map((t) => ({ key: t, label: humanize(t), href: `/employees/${e.id}?tab=${t}` }))} />

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="At a glance" emoji="👀" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-5 md:grid-cols-3">
                <KV label="Service" value={`${years.toFixed(1)} years`} />
                <KV label="Joined" value={fmtDate(e.joinDate, "long")} />
                <KV label={e.status === "PROBATION" ? "Confirmation due" : "Confirmed"} value={fmtDate(e.confirmationDate, "long")} />
                <KV label="Age" value={e.dateOfBirth ? `${age}` : "-"} />
                <KV label="Gender" value={humanize(e.gender)} />
                <KV label="Race / religion" value={`${humanize(e.race)} · ${humanize(e.religion)}`} />
                <KV label="MyKad" value={sensitive ? e.icNo ?? "-" : maskNric(e.icNo)} mono />
                <KV label="Marital status" value={humanize(e.maritalStatus)} />
                <KV label="Home state" value={stateName(e.state)} />
                <KV label="Emergency contact" value={e.emergencyName ? `${e.emergencyName} (${e.emergencyRelation ?? "-"}) ${e.emergencyPhone ?? ""}` : "-"} />
                <KV label="Employment type" value={humanize(e.employmentType)} />
                {e.lastWorkingDate && <KV label="Last working day" value={fmtDate(e.lastWorkingDate, "long")} />}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Reporting line" emoji="🧭" />
            <CardBody className="space-y-4">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Reports to</p>
                {e.manager ? (
                  <Link href={`/employees/${e.manager.id}`} className="flex items-center gap-2 hover:underline">
                    <Avatar name={e.manager.fullName} color={e.manager.avatarColor} size={32} />
                    <span className="text-sm font-semibold">{e.manager.fullName}</span>
                  </Link>
                ) : (
                  <p className="text-sm text-muted">No manager, top of the tree 🌳</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Direct reports ({e.reports.length})</p>
                <div className="space-y-2">
                  {e.reports.map((r) => (
                    <Link key={r.id} href={`/employees/${r.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar name={r.fullName} color={r.avatarColor} size={28} />
                      <span className="text-sm">{r.fullName}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">System access</p>
                {e.user ? (
                  <p className="text-sm">
                    <Badge tone="purple">{humanize(e.user.role)}</Badge> <span className="text-xs text-muted">last login {fmtDate(e.user.lastLoginAt)}</span>
                  </p>
                ) : can(ctx.role, "settings.manage") ? (
                  <FormModal trigger="Create login" triggerVariant="secondary" triggerSize="sm" title="Create login" action={createLoginAction}>
                    <input type="hidden" name="employeeId" value={e.id} />
                    <Field label="Role">
                      <Select name="role" defaultValue="EMPLOYEE" options={ROLES.filter((r) => r !== "OWNER" || ctx.role === "OWNER").map((r) => r)} />
                    </Field>
                    <Field label="Temporary password">
                      <Input name="password" defaultValue="Welcome2026!" />
                    </Field>
                  </FormModal>
                ) : (
                  <p className="text-sm text-muted">No login</p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "job" && (
        <Card>
          <CardHeader title="Job details" emoji="💼" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <KV label="Legal entity" value={e.company.name} />
              <KV label="Branch" value={e.branch ? `${e.branch.name} (${stateName(e.branch.state)})` : "-"} />
              <KV label="Department" value={e.department?.name} />
              <KV label="Cost centre" value={e.department?.costCenter} />
              <KV label="Position" value={e.position?.title} />
              <KV label="Grade" value={e.grade ? `${e.grade.code} · ${e.grade.name}` : "-"} />
              <KV label="Probation" value={`${e.probationMonths} months`} />
              <KV label="Contract ends" value={fmtDate(e.contractEndDate, "long")} />
              <KV label="Normal hours / day" value={e.workHoursPerDay} />
              <KV label="Notice (contractual)" value={e.noticeWeeks ? `${e.noticeWeeks} weeks` : "Per EA s.12"} />
            </dl>
            {e.grade && sensitive && (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-soft-line p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Position in {e.grade.code} salary band</p>
                <div className="mt-2 flex items-center justify-between text-xs font-mono">
                  <span>{rm(e.grade.minSalary, { decimals: 0 })}</span>
                  <span>mid {rm(e.grade.midSalary, { decimals: 0 })}</span>
                  <span>{rm(e.grade.maxSalary, { decimals: 0 })}</span>
                </div>
                <Progress className="mt-1" value={((e.basicSalary - e.grade.minSalary) / (e.grade.maxSalary - e.grade.minSalary)) * 100} tone="bg-grape" />
                <p className="mt-2 text-sm">
                  Compa-ratio <b>{(e.basicSalary / e.grade.midSalary).toFixed(2)}</b>
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "pay" && sensitive && <PayTab e={e} manage={can(ctx.role, "payroll.manage")} tenantId={ctx.tenantId} />}

      {tab === "family" && (
        <Card>
          <CardHeader
            title="Spouse & children"
            emoji="👨‍👩‍👧"
            subtitle={`PCB category ${pcbCategory(e.maritalStatus, e.spouseWorking, e.children.length)} · Child relief ${rm(childReliefTotal(e.children.map((c) => ({ age: ageOn(c.dateOfBirth, today), studying: c.studying, disabled: c.disabled }))), { decimals: 0 })}`}
            action={
              (manage || ctx.employeeId === e.id) && (
                <FormModal trigger="+ Add child" triggerSize="sm" title="Add child" action={addChildAction}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <Field label="Name">
                    <Input name="name" required />
                  </Field>
                  <Field label="Date of birth">
                    <Input type="date" name="dateOfBirth" required />
                  </Field>
                  <Checkbox name="studying" label="18+ and studying (diploma or higher)" />
                  <Checkbox name="disabled" label="Disabled (OKU)" />
                </FormModal>
              )
            }
          />
          <CardBody>
            <dl className="mb-5 grid grid-cols-2 gap-5 md:grid-cols-4">
              <KV label="Marital status" value={humanize(e.maritalStatus)} />
              <KV label="Spouse" value={e.spouseName ?? "-"} />
              <KV label="Spouse working" value={e.spouseWorking ? "Yes" : "No"} />
              <KV label="OKU" value={[e.disabled && "Self", e.spouseDisabled && "Spouse"].filter(Boolean).join(", ") || "No"} />
            </dl>
            {e.children.length === 0 ? (
              <p className="text-sm text-muted">No children on record.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>Age</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Tax relief</TH>
                    <TH />
                  </tr>
                </THead>
                <tbody>
                  {e.children.map((c) => {
                    const a = ageOn(c.dateOfBirth, today);
                    return (
                      <TR key={c.id}>
                        <TD className="font-semibold">{c.name}</TD>
                        <TD>{a}</TD>
                        <TD>{[c.studying && "Studying", c.disabled && "OKU"].filter(Boolean).join(", ") || "-"}</TD>
                        <TD className="text-right font-mono">{rm(childReliefTotal([{ age: a, studying: c.studying, disabled: c.disabled }]), { decimals: 0 })}</TD>
                        <TD className="text-right">{manage && <ActionButton action={removeChildAction} fields={{ id: c.id }} confirm="Remove this child?">Remove</ActionButton>}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader
            title="Documents"
            emoji="📁"
            action={
              manage && (
                <FormModal trigger="+ Add document" triggerSize="sm" title="Add document" action={addDocumentAction}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <Field label="Type">
                    <Select name="type" options={["IC", "PASSPORT", "CERTIFICATE", "CONTRACT", "MEDICAL", "OTHER"]} />
                  </Field>
                  <Field label="Name">
                    <Input name="name" required placeholder="Degree certificate" />
                  </Field>
                  <Field label="Link / file reference">
                    <Input name="url" placeholder="https://drive…" />
                  </Field>
                  <Field label="Expiry date (optional)">
                    <Input type="date" name="expiryDate" />
                  </Field>
                </FormModal>
              )
            }
          />
          {e.documents.length === 0 ? (
            <EmptyState emoji="📂" title="No documents yet" body="Upload MyKad copies, certificates, contracts and medical reports here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Document</TH>
                  <TH>Type</TH>
                  <TH>Expiry</TH>
                  <TH>Added</TH>
                </tr>
              </THead>
              <tbody>
                {e.documents.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-semibold">{d.url ? <a href={d.url} className="underline">{d.name}</a> : d.name}</TD>
                    <TD>{humanize(d.type)}</TD>
                    <TD>{d.expiryDate ? <Badge tone={d.expiryDate < today ? "red" : "gray"}>{fmtDate(d.expiryDate)}</Badge> : "-"}</TD>
                    <TD className="text-xs">{fmtDate(d.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "leave" && <LeaveTab employeeId={e.id} />}
      {tab === "payslips" && sensitive && <PayslipsTab employeeId={e.id} />}

      {tab === "history" && (
        <Card>
          <CardHeader title="Job history" emoji="🕰️" />
          <CardBody>
            <ol className="relative ml-3 border-l-2 border-ink">
              {e.history.map((h) => (
                <li key={h.id} className="mb-5 ml-5">
                  <span className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-2 border-ink bg-lime" />
                  <p className="font-mono text-xs text-muted">{fmtDate(h.effectiveDate, "long")}</p>
                  <p className="font-semibold">{h.title}</p>
                  {h.details && <p className="text-sm text-ink-2">{h.details}</p>}
                  <Badge tone="gray" className="mt-1">
                    {humanize(h.type)}
                  </Badge>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {tab === "assets" && (
        <Card>
          <CardHeader title="Company assets" emoji="💻" />
          {e.assets.length === 0 ? (
            <EmptyState emoji="📦" title="No assets assigned" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Tag</TH>
                  <TH>Asset</TH>
                  <TH>Category</TH>
                  <TH>Since</TH>
                </tr>
              </THead>
              <tbody>
                {e.assets.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-mono text-xs">{a.tag}</TD>
                    <TD className="font-semibold">{a.name}</TD>
                    <TD>{humanize(a.category)}</TD>
                    <TD>{fmtDate(a.assignedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

async function PayTab({ e, manage, tenantId }: { e: NonNullable<Awaited<ReturnType<typeof loadForPay>>>; manage: boolean; tenantId: string }) {
  const items = await prisma.payItem.findMany({ where: { tenantId, active: true, system: false }, orderBy: { name: "asc" } });
  const age = ageOn(e.dateOfBirth, todayMY());
  const recurring = e.payItems.filter((p) => p.payItem.kind === "EARNING").reduce((s, p) => s + p.amount, 0);
  const wages = e.basicSalary + e.payItems.filter((p) => p.payItem.epf && p.payItem.kind === "EARNING").reduce((s, p) => s + p.amount, 0);
  const epf = calcEpf({ wages, age, citizenship: e.citizenship as "CITIZEN", employeeRateOverride: e.epfEmployeeRate, employerRateOverride: e.epfEmployerRate });
  const socso = calcSocso({ wages: e.basicSalary + recurring, age, citizenship: e.citizenship as "CITIZEN" });
  const eis = calcEis({ wages: e.basicSalary + recurring, age, citizenship: e.citizenship as "CITIZEN" });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Monthly pay"
          emoji="💰"
          action={
            manage && (
              <FormModal trigger="+ Recurring item" triggerSize="sm" title="Add recurring allowance / deduction" action={addRecurringPayAction}>
                <input type="hidden" name="employeeId" value={e.id} />
                <Field label="Pay item">
                  <Select name="payItemId" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.kind.toLowerCase()})` }))} />
                </Field>
                <Field label="Amount (RM / month)">
                  <Input type="number" step="0.01" name="amount" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (optional)">
                    <Input type="date" name="startDate" />
                  </Field>
                  <Field label="End (optional)">
                    <Input type="date" name="endDate" />
                  </Field>
                </div>
              </FormModal>
            )
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH>Type</TH>
              <TH>Statutory</TH>
              <TH className="text-right">RM / month</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            <TR>
              <TD className="font-semibold">Basic salary</TD>
              <TD>Earning</TD>
              <TD className="text-xs">EPF · SOCSO · EIS · PCB · HRDF</TD>
              <TD className="text-right">
                <Money value={e.basicSalary} />
              </TD>
              <TD />
            </TR>
            {e.payItems.map((p) => (
              <TR key={p.id}>
                <TD className="font-semibold">{p.payItem.name}</TD>
                <TD>{humanize(p.payItem.kind)}</TD>
                <TD className="text-xs">{[p.payItem.epf && "EPF", p.payItem.socso && "SOCSO", p.payItem.eis && "EIS", p.payItem.pcb && "PCB", p.payItem.hrdf && "HRDF"].filter(Boolean).join(" · ") || "-"}</TD>
                <TD className="text-right">
                  <Money value={p.amount} />
                </TD>
                <TD className="text-right">{manage && <ActionButton action={removeRecurringPayAction} fields={{ id: p.id }} confirm="Remove this item?">Remove</ActionButton>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Statutory estimate" emoji="🏛️" subtitle="Based on current recurring pay" />
        <CardBody className="space-y-3 text-sm">
          <Row label={`EPF employee (${epf.employeeRate}%)`} value={epf.employee} />
          <Row label={`EPF employer (${epf.employerRate}%)`} value={epf.employer} />
          <Row label={`SOCSO (cat. ${socso.category})`} value={socso.employee} sub={`Employer ${rm(socso.employer)}`} />
          <Row label="EIS" value={eis.employee} sub={eis.eligible ? `Employer ${rm(eis.employer)}` : eis.note} />
          <div className="border-t-2 border-dashed border-soft-line pt-3">
            <dl className="grid grid-cols-2 gap-3">
              <KV label="Bank" value={e.bankName} />
              <KV label="Account" value={e.bankAccountNo} mono />
              <KV label="EPF no." value={e.epfNo} mono />
              <KV label="SOCSO no." value={e.socsoNo} mono />
              <KV label="Tax no." value={e.taxNo} mono />
              <KV label="Tax resident" value={e.taxResident ? "Yes" : "No (30% flat)"} />
              <KV label="Zakat / month" value={rm(e.zakatMonthly)} />
              <KV label="HRD Corp levy" value={e.hrdfApplicable && e.citizenship === "CITIZEN" ? "Yes" : "No"} />
            </dl>
          </div>
          {epf.note && <Callout emoji="ℹ️">{epf.note}</Callout>}
        </CardBody>
      </Card>
    </div>
  );
}

function loadForPay(id: string) {
  return prisma.employee.findUnique({ where: { id }, include: { payItems: { include: { payItem: true } } } });
}

function Row({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-start justify-between">
      <span>
        {label}
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <span className="font-mono font-semibold">{rm(value)}</span>
    </div>
  );
}

async function LeaveTab({ employeeId }: { employeeId: string }) {
  const year = todayMY().getUTCFullYear();
  const [balances, requests] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { employeeId, year }, include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } }),
    prisma.leaveRequest.findMany({ where: { employeeId }, include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 20 }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {balances
          .filter((b) => b.entitled + b.adjustment + b.carriedForward > 0 || b.taken > 0)
          .map((b) => (
            <div key={b.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal-sm">
              <p className="text-xs font-bold">
                {b.leaveType.emoji} {b.leaveType.name}
              </p>
              <p className="font-display mt-1 text-2xl font-extrabold">
                {available(b)}
                <span className="text-sm font-bold text-muted"> / {b.entitled + b.carriedForward + b.adjustment}</span>
              </p>
              <p className="text-[11px] text-muted">
                {b.taken} taken · {b.pending} pending
              </p>
            </div>
          ))}
      </div>
      <Card>
        <CardHeader title="Recent requests" emoji="🗓️" />
        <Table>
          <THead>
            <tr>
              <TH>Type</TH>
              <TH>Dates</TH>
              <TH>Days</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>
                  {r.leaveType.emoji} {r.leaveType.name}
                </TD>
                <TD className="text-xs">
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                </TD>
                <TD>{r.days}</TD>
                <TD className="max-w-xs truncate text-xs">{r.reason}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

async function PayslipsTab({ employeeId }: { employeeId: string }) {
  const slips = await prisma.payslip.findMany({ where: { employeeId }, include: { run: true }, orderBy: { period: "desc" } });
  return (
    <Card>
      <CardHeader title="Payslips" emoji="🧾" />
      {slips.length === 0 ? (
        <EmptyState emoji="🧾" title="No payslips yet" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Period</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">EPF</TH>
              <TH className="text-right">SOCSO+EIS</TH>
              <TH className="text-right">PCB</TH>
              <TH className="text-right">Net</TH>
              <TH>Run</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {slips.map((s) => (
              <TR key={s.id}>
                <TD className="font-semibold">{s.period}</TD>
                <TD className="text-right"><Money value={s.grossPay} /></TD>
                <TD className="text-right"><Money value={s.epfEE} /></TD>
                <TD className="text-right"><Money value={s.socsoEE + s.eisEE} /></TD>
                <TD className="text-right"><Money value={s.pcb} /></TD>
                <TD className="text-right font-bold"><Money value={s.netPay} /></TD>
                <TD><StatusBadge status={s.run.status} /></TD>
                <TD className="text-right">
                  <Link href={`/payroll/${s.runId}/payslip/${s.id}`} className="text-xs font-bold underline">View</Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
