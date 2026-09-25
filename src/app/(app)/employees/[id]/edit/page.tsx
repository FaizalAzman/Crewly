import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../../employee-form";
import { updateEmployeeAction } from "../../actions";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("employee.manage");
  const { id } = await params;
  const e = await prisma.employee.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!e) notFound();
  return (
    <>
      <PageHeader title={`Edit ${e.preferredName ?? e.fullName}`} emoji="✏️" subtitle="Salary, title and department changes are recorded in the job history." />
      <EmployeeForm tenantId={ctx.tenantId} employee={e} action={updateEmployeeAction} />
    </>
  );
}
