import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Field, PageHeader, Select } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { ChecklistBoard } from "./checklist-board";
import { startChecklistAction } from "./actions";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const ctx = await requireCtx("lifecycle.manage");
  const without = await prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] }, checklists: { none: { type: "ONBOARDING" } }, joinDate: { gte: new Date(Date.now() - 120 * 86400000) } } });
  return (
    <>
      <PageHeader
        title="Onboarding"
        emoji="🚀"
        subtitle="Checklists for new joiners: statutory registrations (KWSP, PERKESO, CP22), equipment, buddy and probation goals."
        actions={
          without.length > 0 && (
            <FormModal trigger="Start checklist" title="Start onboarding checklist" action={startChecklistAction}>
              <Field label="Employee">
                <Select name="employeeId" options={without.map((e) => ({ value: e.id, label: e.fullName }))} />
              </Field>
            </FormModal>
          )
        }
      />
      <ChecklistBoard type="ONBOARDING" />
    </>
  );
}
