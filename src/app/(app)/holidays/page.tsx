import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Callout, Card, CardHeader, Field, Input, PageHeader, Select, Table, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { holidayAppliesToState } from "@/lib/calendar";
import { STATES, stateName } from "@/lib/constants";
import { fmtDate, parseDate, str, todayMY } from "@/lib/utils";
import { act } from "@/server/action";
import { assertCan, audit } from "@/server/guard";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Public holidays" };

async function addHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    assertCan(ctx, "leave.manage");
    const date = parseDate(str(fd, "date"));
    if (!date) throw new DomainError("Pick a date.");
    const name = str(fd, "name");
    if (!name) throw new DomainError("Name the holiday.");
    await prisma.publicHoliday.create({ data: { tenantId: ctx.tenantId, date, name, states: str(fd, "states") || "ALL", kind: str(fd, "kind") || "COMPANY", year: date.getUTCFullYear() } });
    await audit(ctx, "CREATE", "PublicHoliday", null, `Added holiday ${name} on ${str(fd, "date")}`);
    revalidatePath("/holidays");
    return "Holiday added 🎉";
  });
}

async function removeHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    const h = await prisma.publicHoliday.findFirst({ where: { id: str(fd, "id"), tenantId: ctx.tenantId } });
    if (!h) throw new DomainError("Only company-added holidays can be removed.");
    await prisma.publicHoliday.delete({ where: { id: h.id } });
    revalidatePath("/holidays");
    return "Removed";
  });
}

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ state?: string; year?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const company = await prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } });
  const me = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId }, include: { branch: true } }) : null;
  const state = sp.state ?? me?.branch?.state ?? company?.state ?? "SELANGOR";
  const year = Number(sp.year ?? todayMY().getUTCFullYear());
  const all = await prisma.publicHoliday.findMany({ where: { year, OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] }, orderBy: { date: "asc" } });
  const years = (await prisma.publicHoliday.findMany({ where: { OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] }, distinct: ["year"], select: { year: true }, orderBy: { year: "asc" } })).map((y) => String(y.year));
  const rows = all.filter((h) => h.kind === "COMPANY" || holidayAppliesToState(h.states, state));
  const today = todayMY();
  const manage = can(ctx, "leave.manage");

  return (
    <>
      <PageHeader
        title="Public holidays"
        emoji="🎉"
        subtitle="Federal and state holidays. The state of each employee's branch decides which apply to them."
        actions={
          manage && (
            <FormModal trigger="+ Add holiday" title="Add company / state holiday" action={addHolidayAction}>
              <Field label="Date">
                <Input type="date" name="date" required />
              </Field>
              <Field label="Name">
                <Input name="name" required placeholder="Company anniversary / replacement holiday" />
              </Field>
              <Field label="Kind">
                <Select name="kind" options={[{ value: "COMPANY", label: "Company holiday (everyone)" }, { value: "STATE", label: "Gazetted state holiday" }, { value: "FEDERAL", label: "Gazetted federal holiday" }]} />
              </Field>
              <Field label="States" hint='"ALL", or comma-separated codes e.g. SELANGOR,KUALA_LUMPUR'>
                <Input name="states" defaultValue="ALL" />
              </Field>
            </FormModal>
          )
        }
      />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="State">
          <Select name="state" defaultValue={state} options={STATES.map((s) => ({ value: s.code, label: s.name }))} className="w-60" />
        </Field>
        <Field label="Year">
          <Select name="year" defaultValue={String(year)} options={years.length ? years : [String(year)]} className="w-28" />
        </Field>
        <button className={btnClass("primary")}>Show</button>
      </form>
      <div className="mb-5">
        <Callout emoji="📌">
          The Employment Act requires <b>11 paid public holidays</b> a year, including 5 compulsory ones: National Day, the Agong&apos;s Birthday, the Ruler&apos;s / FT Day, Labour Day and Malaysia Day. Islamic holiday dates depend on moon sighting and may shift by a day.
        </Callout>
      </div>
      <Card>
        <CardHeader title={`${stateName(state)} · ${year}`} emoji="📅" subtitle={`${rows.length} holidays`} />
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Day</TH>
              <TH>Holiday</TH>
              <TH>Type</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rows.map((h) => (
              <TR key={h.id} className={h.date < today ? "opacity-50" : ""}>
                <TD className="font-mono text-xs">{fmtDate(h.date, "long")}</TD>
                <TD className="text-xs">{h.date.toLocaleDateString("en-MY", { weekday: "long", timeZone: "UTC" })}</TD>
                <TD className="font-semibold">{h.name}</TD>
                <TD>
                  <Badge tone={h.kind === "FEDERAL" ? "purple" : h.kind === "STATE" ? "blue" : "lime"}>{h.kind.toLowerCase()}</Badge>
                </TD>
                <TD className="text-right">{manage && h.tenantId && <ActionButton action={removeHolidayAction} fields={{ id: h.id }} confirm="Remove this holiday?">Remove</ActionButton>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
