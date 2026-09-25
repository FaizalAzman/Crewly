import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";
import { createEmployeeAction } from "../actions";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const ctx = await requireCtx("employee.manage");
  return (
    <>
      <PageHeader title="Add employee" emoji="🙌" subtitle="Leave balances and the onboarding checklist are created automatically." />
      <EmployeeForm tenantId={ctx.tenantId} action={createEmployeeAction} />
    </>
  );
}
