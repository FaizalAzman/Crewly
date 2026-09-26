import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Tabs } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { ChecklistBoard } from "./checklist-board";
import { startChecklistAction, templateCreateAction, templateItemAction, templateItemRemoveAction } from "./actions";

export const metadata: Metadata = { title: "Onboarding" };

const OWNERS = ["HR", "MANAGER", "IT", "PAYROLL", "EMPLOYEE"];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("lifecycle.manage");
  const tab = (await searchParams).tab ?? "active";
  const [without, templates] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] }, checklists: { none: { type: "ONBOARDING" } }, joinDate: { gte: new Date(Date.now() - 120 * 86400000) } } }),
    prisma.checklistTemplate.findMany({ where: { tenantId: ctx.tenantId }, include: { items: { orderBy: [{ dueOffsetDays: "asc" }, { sortOrder: "asc" }] } }, orderBy: { type: "asc" } }),
  ]);
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
      <Tabs active={tab} tabs={[{ key: "active", label: "Active checklists", href: "/onboarding?tab=active" }, { key: "templates", label: "Checklist templates", href: "/onboarding?tab=templates", count: templates.length }]} />
      {tab === "active" ? (
        <ChecklistBoard type="ONBOARDING" />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <FormModal trigger="+ New template" title="New checklist template" action={templateCreateAction}>
              <Field label="Name"><Input name="name" required placeholder="Engineering onboarding" /></Field>
              <Field label="Type"><Select name="type" options={["ONBOARDING", "OFFBOARDING"]} /></Field>
            </FormModal>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader
                  title={t.name}
                  emoji={t.type === "ONBOARDING" ? "🚀" : "👋"}
                  subtitle={`${t.items.length} tasks · due dates are relative to the ${t.type === "ONBOARDING" ? "join date" : "last working day"}`}
                  action={
                    <FormModal trigger="+ Task" triggerSize="sm" title={`Add task · ${t.name}`} action={templateItemAction}>
                      <input type="hidden" name="templateId" value={t.id} />
                      <Field label="Task"><Input name="title" required /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Owner"><Select name="owner" options={OWNERS} /></Field>
                        <Field label="Due (days from anchor)" hint="Negative = before"><Input type="number" name="dueOffsetDays" defaultValue="0" /></Field>
                      </div>
                    </FormModal>
                  }
                />
                <CardBody>
                  <ul className="space-y-1.5">
                    {t.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-paper-2">
                        <span className="text-sm">
                          {i.title}
                          <span className="ml-2 text-[10px] font-bold uppercase text-muted">{i.owner}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge tone="gray">{i.dueOffsetDays === 0 ? "Day 0" : i.dueOffsetDays > 0 ? `+${i.dueOffsetDays}d` : `${i.dueOffsetDays}d`}</Badge>
                          <ActionButton action={templateItemRemoveAction} fields={{ id: i.id }} variant="ghost" confirm="Remove this task from the template?">✕</ActionButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
