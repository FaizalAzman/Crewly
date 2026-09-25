import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Card, CardHeader, Checkbox, Field, Input, Money, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { DecideButtons } from "@/components/decide-buttons";
import { ClaimButton } from "@/components/request-forms";
import { HBarChart } from "@/components/charts";
import { act } from "@/server/action";
import { boolField, fmtDate, numField, optStr, rm, round2, str, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { scopedEmployeeWhere } from "@/server/services/scope";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Claims" };

async function saveClaimTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("claims.pay");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = {
      name: str(fd, "name"),
      emoji: str(fd, "emoji") || "🧾",
      category: str(fd, "category") || "GENERAL",
      monthlyLimit: str(fd, "monthlyLimit") ? numField(fd, "monthlyLimit") : null,
      yearlyLimit: str(fd, "yearlyLimit") ? numField(fd, "yearlyLimit") : null,
      requiresReceipt: boolField(fd, "requiresReceipt"),
      taxable: boolField(fd, "taxable"),
      active: boolField(fd, "active"),
    };
    if (!data.name) throw new DomainError("Name is required.");
    if (data.monthlyLimit && data.yearlyLimit && data.monthlyLimit > data.yearlyLimit) throw new DomainError("Monthly limit can't exceed the yearly limit.");
    if (id) await prisma.claimType.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.claimType.create({ data: { ...data, tenantId: ctx.tenantId } });
    revalidatePath("/claims");
    return "Claim type saved";
  });
}

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const ctx = await requireCtx("claims.approve");
  const sp = await searchParams;
  const tab = sp.tab ?? "claims";
  const status = sp.status ?? "PENDING";
  const scope = await scopedEmployeeWhere(ctx);
  const year = todayMY().getUTCFullYear();
  const [claims, types, all] = await Promise.all([
    prisma.claim.findMany({ where: { tenantId: ctx.tenantId, ...scope, ...(status !== "ALL" ? { status } : {}) }, include: { employee: { include: { department: true } }, claimType: true }, orderBy: { date: "desc" }, take: 200 }),
    prisma.claimType.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.claim.findMany({ where: { tenantId: ctx.tenantId, date: { gte: new Date(Date.UTC(year, 0, 1)) }, status: { in: ["APPROVED", "PAID"] } }, include: { claimType: true } }),
  ]);
  const byType = Object.entries(all.reduce<Record<string, number>>((a, c) => ({ ...a, [c.claimType.name]: (a[c.claimType.name] ?? 0) + c.amount }), {}))
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
  const pending = claims.filter((c) => c.status === "PENDING");
  const typeForm = (t?: (typeof types)[number]) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name" className="col-span-2">
          <Input name="name" defaultValue={t?.name} required />
        </Field>
        <Field label="Emoji">
          <Input name="emoji" defaultValue={t?.emoji ?? "🧾"} />
        </Field>
        <Field label="Category">
          <Select name="category" defaultValue={t?.category ?? "GENERAL"} options={["MEDICAL", "TRAVEL", "MILEAGE", "MEAL", "PHONE", "TRAINING", "GENERAL"]} />
        </Field>
        <Field label="Monthly limit">
          <Input type="number" name="monthlyLimit" defaultValue={t?.monthlyLimit ?? ""} />
        </Field>
        <Field label="Yearly limit">
          <Input type="number" name="yearlyLimit" defaultValue={t?.yearlyLimit ?? ""} />
        </Field>
      </div>
      <Checkbox name="requiresReceipt" label="Receipt required" defaultChecked={t?.requiresReceipt ?? true} />
      <Checkbox name="taxable" label="Taxable benefit (added to PCB and Form EA B3)" defaultChecked={t?.taxable ?? false} />
      <Checkbox name="active" label="Active" defaultChecked={t?.active ?? true} />
    </>
  );

  return (
    <>
      <PageHeader title="Claims" emoji="💳" subtitle="Expense claims with limits and receipts. Approved claims are reimbursed through the next payroll." actions={<ClaimButton tenantId={ctx.tenantId} onBehalf btn={{ label: "+ Claim on behalf", variant: "primary" }} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending approval" value={rm(pending.reduce((s, c) => s + c.amount, 0), { decimals: 0 })} hint={`${pending.length} claims`} tone="sunny" emoji="⏳" />
        <StatCard label="Approved, unpaid" value={rm(all.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amount, 0), { decimals: 0 })} tone="sky" emoji="🏦" />
        <StatCard label={`Reimbursed ${year}`} value={rm(all.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amount, 0), { decimals: 0 })} tone="lime" emoji="✅" />
        <StatCard label="Claim types" value={types.filter((t) => t.active).length} tone="white" emoji="🗂️" />
      </div>
      <Tabs active={tab} tabs={[{ key: "claims", label: "Claims", href: "/claims?tab=claims" }, { key: "insights", label: "Spend by type", href: "/claims?tab=insights" }, ...(can(ctx.role, "claims.pay") ? [{ key: "types", label: "Claim types & limits", href: "/claims?tab=types" }] : [])]} />
      {tab === "claims" && (
        <Card>
          <div className="flex flex-wrap gap-2 border-b-2 border-ink p-3">
            {["PENDING", "APPROVED", "PAID", "REJECTED", "ALL"].map((s) => (
              <Link key={s} href={`/claims?status=${s}`} className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-bold ${status === s ? "bg-ink text-paper" : "bg-card"}`}>
                {humanize(s)}
              </Link>
            ))}
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH>Details</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {claims.map((c) => (
                <TR key={c.id}>
                  <TD><PersonCell name={c.employee.fullName} sub={c.employee.department?.name} color={c.employee.avatarColor} /></TD>
                  <TD>{c.claimType.emoji} {c.claimType.name}{c.claimType.taxable && <Badge tone="orange" className="ml-1">taxable</Badge>}</TD>
                  <TD className="text-xs">{fmtDate(c.date)}</TD>
                  <TD className="max-w-xs text-xs">
                    {c.description}
                    {c.mileageKm && ` · ${c.mileageKm} km`}
                    {c.merchant && <span className="block text-muted">@ {c.merchant}</span>}
                  </TD>
                  <TD className="text-right font-bold"><Money value={c.amount} /></TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD>{c.status === "PENDING" && <DecideButtons kind="claim" id={c.id} />}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === "insights" && (
        <Card>
          <CardHeader title={`Reimbursed by type · ${year}`} emoji="📊" />
          <div className="p-5">
            <HBarChart money data={byType} height={Math.max(220, byType.length * 34)} />
          </div>
        </Card>
      )}
      {tab === "types" && (
        <Card>
          <CardHeader title="Claim types & limits" emoji="🗂️" action={<FormModal trigger="+ Type" triggerSize="sm" title="New claim type" action={saveClaimTypeAction}>{typeForm()}</FormModal>} />
          <Table>
            <THead>
              <tr>
                <TH>Type</TH>
                <TH>Category</TH>
                <TH className="text-right">Monthly</TH>
                <TH className="text-right">Yearly</TH>
                <TH>Rules</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {types.map((t) => (
                <TR key={t.id}>
                  <TD className="font-semibold">{t.emoji} {t.name}</TD>
                  <TD className="text-xs">{humanize(t.category)}</TD>
                  <TD className="text-right">{t.monthlyLimit ? rm(t.monthlyLimit, { decimals: 0 }) : "–"}</TD>
                  <TD className="text-right">{t.yearlyLimit ? rm(t.yearlyLimit, { decimals: 0 }) : "–"}</TD>
                  <TD className="space-x-1">
                    {t.requiresReceipt && <Badge tone="gray">📎 Receipt</Badge>}
                    {t.taxable && <Badge tone="orange">Taxable</Badge>}
                    {!t.active && <Badge tone="gray">Inactive</Badge>}
                  </TD>
                  <TD className="text-right"><FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${t.name}`} action={saveClaimTypeAction}>{typeForm(t)}</FormModal></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
