import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Callout, Card, CardBody, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { EaFormView } from "@/components/ea-form-view";
import { PdfButton } from "@/components/pdf-button";
import { eaForm } from "@/server/services/tax.service";
import { tp1Total } from "@/server/services/payroll.service";
import { rm, todayMY } from "@/lib/utils";
import { saveTaxDeclarationAction } from "../actions";
import { TP1_FIELDS } from "@/lib/tax-reliefs";

export const metadata: Metadata = { title: "Tax & reliefs" };



export default async function MyTaxPage() {
  const ctx = await requireCtx();
  const year = todayMY().getUTCFullYear();
  const decl = await prisma.taxDeclaration.findUnique({ where: { employeeId_year: { employeeId: ctx.employeeId!, year } } });
  const ea = await eaForm(ctx, ctx.employeeId!, year);
  const v = (k: string) => (decl ? (decl as unknown as Record<string, number>)[k] : 0);
  return (
    <>
      <PageHeader title="Tax & reliefs" emoji="🧮" subtitle="Declare reliefs (TP1) and previous-employer income (TP3) so your monthly PCB is accurate." actions={<PdfButton href={`/api/pdf/ea/${ctx.employeeId}?year=${year}`} label="Download Form EA" />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="no-print space-y-6">
          <ActionForm action={saveTaxDeclarationAction} resetOnSuccess={false} className="space-y-6">
            <input type="hidden" name="year" value={year} />
            <Card>
              <CardHeader title={`TP1 · Additional reliefs ${year}`} emoji="🧾" subtitle={`Total claimed: ${rm(tp1Total(decl as unknown as Record<string, unknown>))} (capped per category)`} />
              <CardBody className="grid gap-3 md:grid-cols-2">
                {TP1_FIELDS.map(([k, label, cap]) => (
                  <Field key={k} label={label} hint={`Max ${rm(cap, { decimals: 0 })}`}>
                    <Input type="number" step="0.01" min={0} name={k} defaultValue={v(k) || ""} />
                  </Field>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="TP3 · Previous employment this year" emoji="🏢" subtitle="Only if you joined mid-year" />
              <CardBody className="grid gap-3 md:grid-cols-2">
                <Field label="Gross remuneration">
                  <Input type="number" step="0.01" name="prevGross" defaultValue={v("prevGross") || ""} />
                </Field>
                <Field label="EPF contributions">
                  <Input type="number" step="0.01" name="prevEpf" defaultValue={v("prevEpf") || ""} />
                </Field>
                <Field label="PCB deducted">
                  <Input type="number" step="0.01" name="prevPcb" defaultValue={v("prevPcb") || ""} />
                </Field>
                <Field label="Zakat paid">
                  <Input type="number" step="0.01" name="prevZakat" defaultValue={v("prevZakat") || ""} />
                </Field>
              </CardBody>
            </Card>
            <div className="flex justify-end">
              <SubmitButton>Save declaration</SubmitButton>
            </div>
          </ActionForm>
          <Callout emoji="💡">Individual (RM9,000), spouse, child and EPF (up to RM4,000) reliefs are applied automatically from your profile, so you don&apos;t need to declare them here.</Callout>
        </div>
        <EaFormView ea={ea} />
      </div>
    </>
  );
}
