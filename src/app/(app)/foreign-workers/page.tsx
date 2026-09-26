import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Field, Input, Money, PageHeader, PersonCell, Select, StatCard, Table, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { passportOkForRenewal, permitAlert, upsertPermit } from "@/server/services/relations.service";
import { dateField, daysBetween, fmtDate, numField, optStr, rm, str, todayMY, toISODate } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Foreign workforce" };

async function permitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("foreign.manage");
  return act(async () => {
    await upsertPermit(ctx, {
      id: optStr(fd, "id") ?? undefined,
      employeeId: str(fd, "employeeId"),
      permitType: str(fd, "permitType"),
      permitNo: str(fd, "permitNo"),
      sector: str(fd, "sector"),
      sourceCountry: str(fd, "sourceCountry"),
      issueDate: dateField(fd, "issueDate") as Date,
      expiryDate: dateField(fd, "expiryDate") as Date,
      levyAmount: numField(fd, "levyAmount"),
      levyPaidUntil: dateField(fd, "levyPaidUntil"),
      fomemaDate: dateField(fd, "fomemaDate"),
      fomemaStatus: str(fd, "fomemaStatus") || "PENDING",
      insuranceNo: optStr(fd, "insuranceNo"),
      insuranceExpiry: dateField(fd, "insuranceExpiry"),
    });
    revalidatePath("/foreign-workers");
    return "Permit saved";
  });
}

const ALERT_TONE = { EXPIRED: "red", CRITICAL: "orange", WARNING: "yellow", OK: "green" } as const;

export default async function ForeignWorkersPage() {
  const ctx = await requireCtx("foreign.manage");
  const today = todayMY();
  const [workers, permits] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, citizenship: "FOREIGNER", status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
    prisma.workPermit.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: { expiryDate: "asc" } }),
  ]);
  const alerts = permits.map((p) => permitAlert(p.expiryDate, today));
  const form = (p?: (typeof permits)[number]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Employee" className="md:col-span-2"><Select name="employeeId" defaultValue={p?.employeeId} options={workers.map((w) => ({ value: w.id, label: `${w.fullName} · ${w.nationality}` }))} /></Field>
      <Field label="Permit type"><Select name="permitType" defaultValue={p?.permitType} options={[{ value: "PLKS", label: "PLKS / VP(TE) (foreign worker)" }, { value: "EP_I", label: "Employment Pass Cat I" }, { value: "EP_II", label: "Employment Pass Cat II" }, { value: "EP_III", label: "Employment Pass Cat III" }, { value: "DP10", label: "DP10 (Sarawak/Sabah)" }, { value: "RP_T", label: "Residence Pass-Talent" }, { value: "PVP", label: "Professional Visit Pass" }]} /></Field>
      <Field label="Permit no."><Input name="permitNo" defaultValue={p?.permitNo} required /></Field>
      <Field label="Sector"><Select name="sector" defaultValue={p?.sector} options={["MANUFACTURING", "CONSTRUCTION", "PLANTATION", "AGRICULTURE", "SERVICES"]} /></Field>
      <Field label="Source country"><Input name="sourceCountry" defaultValue={p?.sourceCountry} required /></Field>
      <Field label="Issue date"><Input type="date" name="issueDate" defaultValue={p ? toISODate(p.issueDate) : ""} required /></Field>
      <Field label="Expiry date"><Input type="date" name="expiryDate" defaultValue={p ? toISODate(p.expiryDate) : ""} required /></Field>
      <Field label="Annual levy (RM)"><Input type="number" name="levyAmount" defaultValue={p?.levyAmount ?? 1850} /></Field>
      <Field label="Levy paid until"><Input type="date" name="levyPaidUntil" defaultValue={p?.levyPaidUntil ? toISODate(p.levyPaidUntil) : ""} /></Field>
      <Field label="FOMEMA status"><Select name="fomemaStatus" defaultValue={p?.fomemaStatus} options={["PENDING", "FIT", "UNFIT"]} /></Field>
      <Field label="FOMEMA date"><Input type="date" name="fomemaDate" defaultValue={p?.fomemaDate ? toISODate(p.fomemaDate) : ""} /></Field>
      <Field label="SPIKPA / insurance no."><Input name="insuranceNo" defaultValue={p?.insuranceNo ?? ""} /></Field>
      <Field label="Insurance expiry"><Input type="date" name="insuranceExpiry" defaultValue={p?.insuranceExpiry ? toISODate(p.insuranceExpiry) : ""} /></Field>
    </div>
  );
  return (
    <>
      <PageHeader title="Foreign workforce" emoji="🌏" subtitle="Work permits (PLKS / Employment Pass), passports, levy, FOMEMA medicals and insurance." actions={<FormModal trigger="+ Permit" title="Add work permit" action={permitAction} wide>{form()}</FormModal>} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Foreign staff" value={workers.length} tone="white" emoji="🌏" />
        <StatCard label="Expired" value={alerts.filter((a) => a === "EXPIRED").length} tone="tangerine" emoji="⛔" />
        <StatCard label="≤ 30 days" value={alerts.filter((a) => a === "CRITICAL").length} tone="bubblegum" emoji="🚨" />
        <StatCard label="≤ 90 days" value={alerts.filter((a) => a === "WARNING").length} tone="sunny" emoji="⏳" />
        <StatCard label="Annual levy" value={rm(permits.reduce((s, p) => s + p.levyAmount, 0), { decimals: 0 })} tone="lime" emoji="💰" />
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Callout emoji="📌">Start PLKS renewal at least <b>3 months</b> before expiry. Passports need at least <b>18 months</b> of validity to renew, and FOMEMA medical screening is required each year.</Callout>
        <Callout tone="sky" emoji="🏦">Since October 2025, foreign workers contribute to EPF at <b>2% / 2%</b>. SOCSO covers employment injury only (employer 1.25%), and EIS does not apply.</Callout>
      </div>
      <Card>
        <CardHeader title="Permits" emoji="🛂" />
        <Table>
          <THead>
            <tr><TH>Worker</TH><TH>Permit</TH><TH>Sector</TH><TH>Expiry</TH><TH>Passport</TH><TH>FOMEMA</TH><TH className="text-right">Levy</TH><TH /></tr>
          </THead>
          <tbody>
            {permits.map((p) => {
              const a = permitAlert(p.expiryDate, today);
              const passportOk = passportOkForRenewal(p.employee.passportExpiry, today);
              return (
                <TR key={p.id}>
                  <TD><PersonCell name={p.employee.fullName} sub={`${p.sourceCountry} · ${p.employee.passportNo ?? ""}`} color={p.employee.avatarColor} /></TD>
                  <TD className="text-xs"><b>{humanize(p.permitType)}</b><span className="block font-mono text-muted">{p.permitNo}</span></TD>
                  <TD className="text-xs">{humanize(p.sector)}</TD>
                  <TD>
                    <Badge tone={ALERT_TONE[a]}>{a === "EXPIRED" ? "Expired" : `${daysBetween(today, p.expiryDate)}d`}</Badge>
                    <span className="block text-[11px] text-muted">{fmtDate(p.expiryDate, "long")}</span>
                  </TD>
                  <TD className="text-xs">{p.employee.passportExpiry ? <>{fmtDate(p.employee.passportExpiry)} {!passportOk && <Badge tone="orange">&lt;18 mo</Badge>}</> : "-"}</TD>
                  <TD><Badge tone={p.fomemaStatus === "FIT" ? "green" : p.fomemaStatus === "UNFIT" ? "red" : "yellow"}>{p.fomemaStatus}</Badge></TD>
                  <TD className="text-right">
                    <Money value={p.levyAmount} />
                    <span className="block text-[11px]">{p.levyPaidUntil ? (p.levyPaidUntil < today ? <Badge tone="red">Levy lapsed</Badge> : `paid to ${fmtDate(p.levyPaidUntil)}`) : <Badge tone="yellow">Levy unpaid</Badge>}</span>
                  </TD>
                  <TD><FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title="Edit permit" action={permitAction} wide>{form(p)}</FormModal></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
