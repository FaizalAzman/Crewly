import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Callout, Card, CardBody, CardHeader, LinkButton, PageHeader, btnClass } from "@/components/ui";
import { IMPORT_COLUMNS } from "@/server/services/import.service";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import employees" };

export default async function ImportPage() {
  const ctx = await requireCtx("employee.manage");
  const depts = await prisma.department.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: "asc" } });
  return (
    <>
      <PageHeader
        title="Import employees"
        emoji="📥"
        subtitle="Bulk-add staff from a spreadsheet. Each row runs through the same checks as the form: NRIC, minimum wage, duplicates and so on."
        actions={<LinkButton href="/employees" variant="secondary">← Employees</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Upload" emoji="📄" subtitle="Validate first. Import only creates the rows that pass." />
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <a href="/api/export/employee-template" className={`${btnClass("lime")} w-full`}>
            <Download size={15} /> Download CSV template
          </a>
          <Callout emoji="📋">
            <b>Required:</b> fullName, email, jobTitle, joinDate (YYYY-MM-DD), basicSalary, plus icNo for citizens/PRs or passportNo for foreigners.
            <br />
            <b>Optional:</b> {IMPORT_COLUMNS.filter((c) => !["fullName", "email", "jobTitle", "joinDate", "basicSalary"].includes(c)).join(", ")}.
          </Callout>
          <Callout tone="sky" emoji="🏢">
            <b>Department</b> accepts a code or name: {depts.map((d) => d.code).join(", ")}. Import managers before their reports so <b>managerEmail</b> resolves.
          </Callout>
        </div>
      </div>
    </>
  );
}
