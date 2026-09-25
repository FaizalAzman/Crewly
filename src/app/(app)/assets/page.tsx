import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, Field, Input, Money, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { assignAsset, bookValue, returnAsset } from "@/server/services/relations.service";
import { dateField, fmtDate, numField, optStr, rm, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Assets" };

async function createAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("assets.manage");
  return act(async () => {
    const tag = str(fd, "tag");
    if (await prisma.asset.findFirst({ where: { tenantId: ctx.tenantId, tag } })) throw new DomainError("Asset tag already exists.");
    await prisma.asset.create({ data: { tenantId: ctx.tenantId, tag, name: str(fd, "name"), category: str(fd, "category"), serialNo: optStr(fd, "serialNo"), purchaseDate: dateField(fd, "purchaseDate"), cost: numField(fd, "cost"), condition: "NEW" } });
    revalidatePath("/assets");
    return "Asset added";
  });
}

async function assignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("assets.manage");
  return act(async () => {
    await assignAsset(ctx, str(fd, "id"), str(fd, "employeeId"));
    revalidatePath("/assets");
    return "Assigned";
  });
}

async function returnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("assets.manage");
  return act(async () => {
    await returnAsset(ctx, str(fd, "id"), str(fd, "condition"), optStr(fd, "notes") ?? undefined);
    revalidatePath("/assets");
    return "Returned";
  });
}

export default async function AssetsPage() {
  const ctx = await requireCtx("assets.manage");
  const [assets, emps] = await Promise.all([
    prisma.asset.findMany({ where: { tenantId: ctx.tenantId }, include: { assignedTo: true }, orderBy: { tag: "asc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
  ]);
  const value = assets.reduce((s, a) => s + bookValue(a.cost, a.purchaseDate, a.category === "VEHICLE" ? 5 : 3), 0);
  return (
    <>
      <PageHeader
        title="Assets"
        emoji="💻"
        subtitle="Laptops, phones, vehicles and access cards: who holds what, with returns tracked at offboarding."
        actions={
          <FormModal trigger="+ Asset" title="Add asset" action={createAction}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tag"><Input name="tag" required placeholder="LD-LAP-021" /></Field>
              <Field label="Category"><Select name="category" options={["LAPTOP", "PHONE", "MONITOR", "VEHICLE", "ACCESS_CARD", "FURNITURE", "OTHER"]} /></Field>
            </div>
            <Field label="Name"><Input name="name" required /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Serial no."><Input name="serialNo" /></Field>
              <Field label="Purchased"><Input type="date" name="purchaseDate" /></Field>
              <Field label="Cost (RM)"><Input type="number" name="cost" /></Field>
            </div>
          </FormModal>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total assets" value={assets.length} tone="white" emoji="📦" />
        <StatCard label="Assigned" value={assets.filter((a) => a.status === "ASSIGNED").length} tone="lime" emoji="🧑‍💻" />
        <StatCard label="In repair" value={assets.filter((a) => a.status === "REPAIR").length} tone="sunny" emoji="🔧" />
        <StatCard label="Book value" value={rm(value, { decimals: 0 })} hint="Straight-line, 3 yrs (vehicles 5)" tone="sky" emoji="💰" />
      </div>
      <Card>
        <Table>
          <THead>
            <tr><TH>Tag</TH><TH>Asset</TH><TH>Category</TH><TH>Holder</TH><TH className="text-right">Cost</TH><TH className="text-right">Book value</TH><TH>Condition</TH><TH>Status</TH><TH /></tr>
          </THead>
          <tbody>
            {assets.map((a) => (
              <TR key={a.id}>
                <TD className="font-mono text-xs">{a.tag}</TD>
                <TD className="font-semibold">{a.name}<span className="block font-mono text-[11px] text-muted">{a.serialNo}</span></TD>
                <TD className="text-xs">{humanize(a.category)}</TD>
                <TD>{a.assignedTo ? <PersonCell name={a.assignedTo.fullName} sub={`since ${fmtDate(a.assignedAt)}`} color={a.assignedTo.avatarColor} /> : <span className="text-xs text-muted">-</span>}</TD>
                <TD className="text-right"><Money value={a.cost} /></TD>
                <TD className="text-right"><Money value={bookValue(a.cost, a.purchaseDate, a.category === "VEHICLE" ? 5 : 3)} /></TD>
                <TD><Badge tone={a.condition === "POOR" ? "red" : a.condition === "FAIR" ? "yellow" : "gray"}>{humanize(a.condition)}</Badge></TD>
                <TD><StatusBadge status={a.status} /></TD>
                <TD>
                  {a.status === "AVAILABLE" && (
                    <FormModal trigger="Assign" triggerSize="sm" title={`Assign ${a.name}`} action={assignAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Field label="Employee"><Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
                    </FormModal>
                  )}
                  {a.status === "ASSIGNED" && (
                    <FormModal trigger="Return" triggerSize="sm" triggerVariant="secondary" title={`Return ${a.name}`} action={returnAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Field label="Condition on return"><Select name="condition" options={["GOOD", "FAIR", "POOR"]} /></Field>
                      <Field label="Notes"><Input name="notes" /></Field>
                    </FormModal>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
