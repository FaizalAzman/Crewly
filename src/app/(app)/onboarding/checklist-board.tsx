import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PersonCell, Progress, Select } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { checklistProgress } from "@/server/services/lifecycle.service";
import { fmtDate, todayMY } from "@/lib/utils";
import { addTaskAction, toggleAction } from "./actions";

export async function ChecklistBoard({ type }: { type: "ONBOARDING" | "OFFBOARDING" }) {
  const ctx = await requireCtx("lifecycle.manage");
  const today = todayMY();
  const lists = await prisma.checklist.findMany({
    where: { tenantId: ctx.tenantId, type },
    include: { employee: { include: { department: true } }, tasks: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  const active = lists.filter((l) => checklistProgress(l.tasks) < 100 || l.createdAt > new Date(Date.now() - 30 * 86400000));
  if (active.length === 0) return <Card><EmptyState emoji="✨" title="No active checklists" body={type === "ONBOARDING" ? "New hires get a checklist automatically." : "Checklists start when a separation is approved."} /></Card>;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {active.map((l) => {
        const pct = checklistProgress(l.tasks);
        const overdue = l.tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;
        return (
          <Card key={l.id}>
            <CardHeader
              title={<PersonCell name={l.employee.fullName} sub={`${l.employee.jobTitle} · ${type === "ONBOARDING" ? `joins ${fmtDate(l.employee.joinDate)}` : `last day ${fmtDate(l.employee.lastWorkingDate)}`}`} color={l.employee.avatarColor} href={`/employees/${l.employee.id}`} />}
              action={
                <FormModal trigger="+ Task" triggerSize="sm" triggerVariant="secondary" title="Add task" action={addTaskAction}>
                  <input type="hidden" name="checklistId" value={l.id} />
                  <Field label="Task">
                    <Input name="title" required />
                  </Field>
                  <Field label="Owner">
                    <Select name="owner" options={["HR", "MANAGER", "IT", "PAYROLL", "EMPLOYEE"]} />
                  </Field>
                  <Field label="Due date">
                    <Input type="date" name="dueDate" />
                  </Field>
                </FormModal>
              }
            />
            <CardBody>
              <div className="mb-4 flex items-center gap-3">
                <Progress value={pct} tone={pct === 100 ? "bg-mint" : "bg-lime"} />
                <span className="w-12 text-right font-mono text-sm font-bold">{pct}%</span>
                {overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}
              </div>
              <ul className="space-y-1.5">
                {l.tasks.map((t) => (
                  <li key={t.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${t.done ? "opacity-50" : t.dueDate && t.dueDate < today ? "bg-cherry/10" : "hover:bg-paper-2"}`}>
                    <span className={`text-sm ${t.done ? "line-through" : ""}`}>
                      {t.title}
                      <span className="ml-2 text-[10px] font-bold uppercase text-muted">
                        {t.owner}
                        {t.dueDate && ` · ${fmtDate(t.dueDate)}`}
                      </span>
                    </span>
                    <ActionButton action={toggleAction} fields={{ taskId: t.id, done: String(!t.done) }} variant={t.done ? "ghost" : "secondary"}>
                      {t.done ? "↺" : "✓"}
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
