import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { DomainError, type ActionState } from "@/server/types";
import { boolField, optStr, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";

export const metadata: Metadata = { title: "Pay items" };

async function savePayItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("payroll.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = {
      name: str(fd, "name"),
      kind: str(fd, "kind") || "EARNING",
      category: str(fd, "category") || "ALLOWANCE",
      epf: boolField(fd, "epf"),
      socso: boolField(fd, "socso"),
      eis: boolField(fd, "eis"),
      pcb: boolField(fd, "pcb"),
      hrdf: boolField(fd, "hrdf"),
      additional: boolField(fd, "additional"),
      eaField: optStr(fd, "eaField"),
      active: boolField(fd, "active"),
    };
    if (!data.name) throw new DomainError("Name is required.");
    if (data.kind === "DEDUCTION") Object.assign(data, { epf: false, socso: false, eis: false, pcb: false, hrdf: false, additional: false });
    if (id) {
      const item = await prisma.payItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!item) throw new DomainError("Not found");
      if (item.system) throw new DomainError("System items can't be edited.");
      await prisma.payItem.update({ where: { id }, data });
    } else {
      const code = str(fd, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (!code) throw new DomainError("Code is required.");
      if (await prisma.payItem.findFirst({ where: { tenantId: ctx.tenantId, code } })) throw new DomainError("Code already exists.");
      await prisma.payItem.create({ data: { ...data, code, tenantId: ctx.tenantId } });
    }
    revalidatePath("/pay-items");
    return "Pay item saved";
  });
}

export default async function PayItemsPage() {
  const ctx = await requireCtx("payroll.manage");
  const items = await prisma.payItem.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ kind: "desc" }, { name: "asc" }], include: { _count: { select: { employeeItems: true } } } });
  const form = (p?: (typeof items)[number]) => (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code">
          <Input name="code" defaultValue={p?.code} disabled={!!p} required />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={p?.name} required />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue={p?.kind ?? "EARNING"} options={["EARNING", "DEDUCTION"]} />
        </Field>
        <Field label="Category">
          <Select name="category" defaultValue={p?.category ?? "ALLOWANCE"} options={["ALLOWANCE", "COMMISSION", "BONUS", "OT", "BIK", "DEDUCTION", "OTHER"]} />
        </Field>
        <Field label="Form EA field">
          <Select name="eaField" defaultValue={p?.eaField ?? ""} placeholder="—" options={[{ value: "B1a", label: "B1(a) Salary / wages / OT" }, { value: "B1b", label: "B1(b) Fees / commission / bonus" }, { value: "B1c", label: "B1(c) Allowances / perquisites" }, { value: "B2", label: "B2 Compensation for loss of employment" }, { value: "B3", label: "B3 Benefits in kind" }]} />
        </Field>
      </div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Subject to (earnings only)</p>
      <div className="grid grid-cols-3 gap-2">
        <Checkbox name="epf" label="EPF" defaultChecked={p?.epf ?? true} />
        <Checkbox name="socso" label="SOCSO" defaultChecked={p?.socso ?? true} />
        <Checkbox name="eis" label="EIS" defaultChecked={p?.eis ?? true} />
        <Checkbox name="pcb" label="PCB (taxable)" defaultChecked={p?.pcb ?? true} />
        <Checkbox name="hrdf" label="HRD Corp" defaultChecked={p?.hrdf ?? true} />
        <Checkbox name="additional" label="Additional remuneration" defaultChecked={p?.additional ?? false} />
        <Checkbox name="active" label="Active" defaultChecked={p?.active ?? true} />
      </div>
    </>
  );
  return (
    <>
      <PageHeader title="Pay items" emoji="🧾" subtitle="Earnings and deductions, and whether each is subject to EPF, SOCSO, EIS, PCB and HRD Corp." actions={<FormModal trigger="+ New pay item" title="New pay item" action={savePayItemAction}>{form()}</FormModal>} />
      <div className="mb-5">
        <Callout emoji="📚">
          Typical treatments: <b>overtime</b> is exempt from EPF but subject to SOCSO/EIS; <b>bonuses</b> are subject to EPF but not SOCSO/EIS, and taxed as <i>additional remuneration</i>; <b>reimbursements</b> are not wages at all.
        </Callout>
      </div>
      <Card>
        <CardHeader title="Catalogue" emoji="🗂️" />
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH>Kind</TH>
              <TH>Category</TH>
              <TH>Statutory</TH>
              <TH>EA</TH>
              <TH>In use</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {items.map((p) => (
              <TR key={p.id}>
                <TD>
                  <span className="font-semibold">{p.name}</span> <span className="font-mono text-xs text-muted">{p.code}</span>
                  {p.system && <Badge tone="gray" className="ml-1">system</Badge>}
                  {!p.active && <Badge tone="gray" className="ml-1">inactive</Badge>}
                </TD>
                <TD>
                  <Badge tone={p.kind === "EARNING" ? "green" : "orange"}>{humanize(p.kind)}</Badge>
                </TD>
                <TD className="text-xs">{humanize(p.category)}</TD>
                <TD className="space-x-1">
                  {p.kind === "EARNING" &&
                    (["epf", "socso", "eis", "pcb", "hrdf"] as const).map((k) => (
                      <span key={k} className={`inline-block rounded border border-ink px-1 text-[10px] font-bold ${p[k] ? "bg-lime" : "bg-paper-2 text-muted line-through"}`}>
                        {k.toUpperCase()}
                      </span>
                    ))}
                  {p.additional && <Badge tone="purple">Additional</Badge>}
                </TD>
                <TD className="font-mono text-xs">{p.eaField ?? "-"}</TD>
                <TD>{p._count.employeeItems}</TD>
                <TD className="text-right">
                  {!p.system && (
                    <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${p.name}`} action={savePayItemAction}>
                      {form(p)}
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
