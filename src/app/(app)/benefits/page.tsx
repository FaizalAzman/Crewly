import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, Money, PageHeader, Progress, Select, StatCard, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { boolField, numField, rm, str, todayMY } from "@/lib/utils";
import { humanize, stateName, STATES } from "@/lib/constants";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Benefits" };

async function planAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("benefits.manage");
  return act(async () => {
    const name = str(fd, "name");
    if (!name) throw new DomainError("Name is required.");
    const plan = await prisma.benefitPlan.create({
      data: { tenantId: ctx.tenantId, name, type: str(fd, "type"), provider: str(fd, "provider"), annualLimit: numField(fd, "annualLimit"), premium: numField(fd, "premium"), coversDependants: boolField(fd, "coversDependants"), emoji: str(fd, "emoji") || "🩺" },
    });
    if (boolField(fd, "enrollAll")) {
      const emps = await prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } });
      await prisma.benefitEnrollment.createMany({ data: emps.map((e) => ({ planId: plan.id, employeeId: e.id, startDate: todayMY() })) });
    }
    revalidatePath("/benefits");
    return "Plan created";
  });
}

async function clinicAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("benefits.manage");
  return act(async () => {
    await prisma.panelClinic.create({ data: { tenantId: ctx.tenantId, name: str(fd, "name"), address: str(fd, "address"), state: str(fd, "state"), phone: str(fd, "phone"), type: str(fd, "type") } });
    revalidatePath("/benefits");
    return "Clinic added";
  });
}

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("benefits.manage");
  const tab = (await searchParams).tab ?? "plans";
  const [plans, clinics] = await Promise.all([
    prisma.benefitPlan.findMany({ where: { tenantId: ctx.tenantId }, include: { enrollments: { include: { employee: true } } } }),
    prisma.panelClinic.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ state: "asc" }, { name: "asc" }] }),
  ]);
  const premium = plans.reduce((s, p) => s + p.premium * p.enrollments.length, 0);
  const utilised = plans.reduce((s, p) => s + p.enrollments.reduce((a, e) => a + e.utilised, 0), 0);
  return (
    <>
      <PageHeader
        title="Benefits & insurance"
        emoji="🩺"
        subtitle="Group hospitalisation (GHS), term life (GTL), outpatient panels, dental and wellness."
        actions={
          <>
            <FormModal trigger="+ Panel clinic" triggerVariant="secondary" title="Add panel clinic" action={clinicAction}>
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Address"><Input name="address" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State"><Select name="state" options={STATES.map((s) => ({ value: s.code, label: s.name }))} /></Field>
                <Field label="Type"><Select name="type" options={["GP", "DENTAL", "SPECIALIST", "HOSPITAL"]} /></Field>
              </div>
              <Field label="Phone"><Input name="phone" /></Field>
            </FormModal>
            <FormModal trigger="+ Benefit plan" title="New benefit plan" action={planAction}>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Name" className="col-span-2"><Input name="name" required /></Field>
                <Field label="Emoji"><Input name="emoji" defaultValue="🩺" /></Field>
                <Field label="Type"><Select name="type" options={["GHS", "GTL", "GPA", "OUTPATIENT", "DENTAL", "OPTICAL", "WELLNESS"]} /></Field>
                <Field label="Provider" className="col-span-2"><Input name="provider" required /></Field>
                <Field label="Annual limit"><Input type="number" name="annualLimit" required /></Field>
                <Field label="Premium / person / yr"><Input type="number" name="premium" /></Field>
              </div>
              <Checkbox name="coversDependants" label="Covers dependants" />
              <Checkbox name="enrollAll" label="Enrol all current employees" defaultChecked />
            </FormModal>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Plans" value={plans.length} tone="lime" emoji="📋" />
        <StatCard label="Annual premium" value={rm(premium, { decimals: 0 })} tone="sunny" emoji="💳" />
        <StatCard label="Utilised YTD" value={rm(utilised, { decimals: 0 })} tone="sky" emoji="🏥" />
        <StatCard label="Panel clinics" value={clinics.length} tone="bubblegum" emoji="📍" />
      </div>
      <Tabs active={tab} tabs={[{ key: "plans", label: "Plans", href: "/benefits?tab=plans" }, { key: "clinics", label: "Panel clinics", href: "/benefits?tab=clinics" }]} />
      {tab === "plans" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {plans.map((p) => {
            const used = p.enrollments.reduce((s, e) => s + e.utilised, 0);
            const cap = p.annualLimit * p.enrollments.length;
            return (
              <Card key={p.id}>
                <CardHeader title={p.name} emoji={p.emoji} subtitle={`${p.provider} · ${humanize(p.type)}${p.coversDependants ? " · incl. dependants" : ""}`} action={<Badge tone="gray">{p.enrollments.length} enrolled</Badge>} />
                <CardBody className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-[11px] font-bold uppercase text-muted">Limit / person</p><p className="font-mono font-bold">{rm(p.annualLimit, { decimals: 0 })}</p></div>
                    <div><p className="text-[11px] font-bold uppercase text-muted">Premium / yr</p><p className="font-mono font-bold">{rm(p.premium * p.enrollments.length, { decimals: 0 })}</p></div>
                    <div><p className="text-[11px] font-bold uppercase text-muted">Dependants</p><p className="font-mono font-bold">{p.enrollments.reduce((s, e) => s + e.dependants, 0)}</p></div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold">Utilisation {rm(used, { decimals: 0 })} of {rm(cap, { decimals: 0 })}</p>
                    <Progress value={cap ? (used / cap) * 100 : 0} tone="bg-grape" />
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer font-bold">Top utilisers</summary>
                    <Table className="mt-2">
                      <tbody>
                        {[...p.enrollments].sort((a, b) => b.utilised - a.utilised).slice(0, 5).map((e) => (
                          <TR key={e.id}>
                            <TD>{e.employee.fullName}</TD>
                            <TD className="text-right"><Money value={e.utilised} /></TD>
                            <TD className="w-32"><Progress value={(e.utilised / p.annualLimit) * 100} tone={e.utilised > p.annualLimit * 0.8 ? "bg-tangerine" : "bg-lime"} /></TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  </details>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr><TH>Clinic</TH><TH>Type</TH><TH>State</TH><TH>Address</TH><TH>Phone</TH></tr>
            </THead>
            <tbody>
              {clinics.map((c) => (
                <TR key={c.id}>
                  <TD className="font-semibold">{c.name}</TD>
                  <TD><Badge tone={c.type === "HOSPITAL" ? "pink" : c.type === "DENTAL" ? "blue" : "gray"}>{humanize(c.type)}</Badge></TD>
                  <TD>{stateName(c.state)}</TD>
                  <TD className="text-xs">{c.address}</TD>
                  <TD className="font-mono text-xs">{c.phone}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
