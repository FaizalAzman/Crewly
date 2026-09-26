import { prisma } from "@/lib/db";
import { FormModal } from "./forms";
import { Callout, Field, Input, Select, Textarea } from "./ui";
import { applyLeaveAction, requestLoanAction, requestOvertimeAction, submitClaimAction } from "@/app/(app)/me/actions";
import { todayMY, periodOf, shiftPeriod } from "@/lib/utils";

type Btn = { label?: string; variant?: "primary" | "secondary" | "lime" | "grape"; size?: "sm" | "md" | "lg"; className?: string };

async function employeeOptions(tenantId: string) {
  const emps = await prisma.employee.findMany({ where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, employeeNo: true } });
  return emps.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeNo})` }));
}

export async function ApplyLeaveButton({ tenantId, gender, onBehalf, btn = {} }: { tenantId: string; gender?: string; onBehalf?: boolean; btn?: Btn }) {
  const types = await prisma.leaveType.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" } });
  const emps = onBehalf ? await employeeOptions(tenantId) : [];
  const today = todayMY().toISOString().slice(0, 10);
  return (
    <FormModal trigger={btn.label ?? "🌴 Apply leave"} triggerVariant={btn.variant ?? "lime"} triggerSize={btn.size} triggerClassName={btn.className} title={onBehalf ? "Apply leave on behalf" : "Apply for leave"} subtitle="Rest days and public holidays in your state are excluded automatically." action={applyLeaveAction} submitLabel="Submit">
      {onBehalf && (
        <Field label="Employee">
          <Select name="employeeId" options={emps} />
        </Field>
      )}
      <Field label="Leave type">
        <Select name="leaveTypeId" options={types.filter((t) => !t.gender || !gender || t.gender === gender).map((t) => ({ value: t.id, label: `${t.emoji} ${t.name}` }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" name="startDate" defaultValue={today} required />
        </Field>
        <Field label="To">
          <Input type="date" name="endDate" defaultValue={today} required />
        </Field>
      </div>
      <Field label="Half day?" hint="Only for single-day leave">
        <Select name="halfDay" placeholder="Full day" options={[{ value: "AM", label: "Morning (AM)" }, { value: "PM", label: "Afternoon (PM)" }]} />
      </Field>
      <Field label="Reason">
        <Textarea name="reason" placeholder="Family trip, medical appointment…" />
      </Field>
      <Field label="Medical certificate / supporting document" hint="Required for sick & hospitalisation leave. PDF or photo, max 5 MB.">
        <Input type="file" name="attachmentFile" accept="image/*,application/pdf" className="py-1.5" />
      </Field>
      <Field label="…or reference number">
        <Input name="attachment" placeholder="MC-KL-12345" />
      </Field>
    </FormModal>
  );
}

export async function ClaimButton({ tenantId, onBehalf, btn = {} }: { tenantId: string; onBehalf?: boolean; btn?: Btn }) {
  const [types, tenant] = await Promise.all([
    prisma.claimType.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  const emps = onBehalf ? await employeeOptions(tenantId) : [];
  return (
    <FormModal trigger={btn.label ?? "🧾 Submit claim"} triggerVariant={btn.variant ?? "secondary"} triggerSize={btn.size} triggerClassName={btn.className} title="Submit a claim" subtitle="Reimbursed in the next payroll once approved." action={submitClaimAction} submitLabel="Submit claim">
      {onBehalf && (
        <Field label="Employee">
          <Select name="employeeId" options={emps} />
        </Field>
      )}
      <Field label="Claim type">
        <Select
          name="claimTypeId"
          options={types.map((t) => ({
            value: t.id,
            label: `${t.emoji} ${t.name}${t.monthlyLimit ? ` · RM${t.monthlyLimit}/mo` : ""}${t.yearlyLimit ? ` · RM${t.yearlyLimit}/yr` : ""}`,
          }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expense date">
          <Input type="date" name="date" defaultValue={todayMY().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Amount (RM)" hint="Leave blank for mileage">
          <Input type="number" step="0.01" name="amount" />
        </Field>
      </div>
      <Field label="Mileage (km)" hint={`Mileage claims: RM${tenant.mileageRate.toFixed(2)} per km`}>
        <Input type="number" step="0.1" name="mileageKm" />
      </Field>
      <Field label="Merchant">
        <Input name="merchant" placeholder="Klinik…, Grab, Touch 'n Go" />
      </Field>
      <Field label="What was it for?">
        <Textarea name="description" required />
      </Field>
      <Field label="Receipt" hint="Photo or PDF, max 5 MB. Required for most claim types.">
        <Input type="file" name="receiptFile" accept="image/*,application/pdf" className="py-1.5" />
      </Field>
    </FormModal>
  );
}

export async function OvertimeButton({ tenantId, onBehalf, btn = {} }: { tenantId: string; onBehalf?: boolean; btn?: Btn }) {
  const emps = onBehalf ? await employeeOptions(tenantId) : [];
  return (
    <FormModal trigger={btn.label ?? "⏱️ Claim overtime"} triggerVariant={btn.variant ?? "secondary"} triggerSize={btn.size} triggerClassName={btn.className} title="Claim overtime" subtitle="Rates follow Employment Act s.60A: 1.5× normal day, 2× rest day, 3× public holiday." action={requestOvertimeAction} submitLabel="Submit">
      {onBehalf && (
        <Field label="Employee">
          <Select name="employeeId" options={emps} />
        </Field>
      )}
      <Field label="Date worked">
        <Input type="date" name="date" defaultValue={todayMY().toISOString().slice(0, 10)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="OT hours (beyond normal)">
          <Input type="number" step="0.5" name="hours" defaultValue="2" />
        </Field>
        <Field label="Normal hours" hint="Rest day / public holiday only">
          <Input type="number" step="0.5" name="normalHours" defaultValue="0" />
        </Field>
      </div>
      <Field label="Reason">
        <Textarea name="reason" />
      </Field>
      <Callout emoji="ℹ️">The day type (normal, rest day or public holiday) is detected automatically from your work calendar.</Callout>
    </FormModal>
  );
}

export async function LoanButton({ tenantId, onBehalf, btn = {} }: { tenantId: string; onBehalf?: boolean; btn?: Btn }) {
  const emps = onBehalf ? await employeeOptions(tenantId) : [];
  const next = shiftPeriod(periodOf(todayMY()), 1);
  return (
    <FormModal trigger={btn.label ?? "🪙 Request advance"} triggerVariant={btn.variant ?? "secondary"} triggerSize={btn.size} triggerClassName={btn.className} title="Salary advance / staff loan" action={requestLoanAction} submitLabel="Submit request">
      {onBehalf && (
        <Field label="Employee">
          <Select name="employeeId" options={emps} />
        </Field>
      )}
      <Field label="Type">
        <Select name="type" options={[{ value: "SALARY_ADVANCE", label: "Salary advance (recovered next payroll, max 50% of basic)" }, { value: "STAFF_LOAN", label: "Staff loan (instalments)" }, { value: "EDUCATION_LOAN", label: "Education loan" }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (RM)">
          <Input type="number" step="0.01" name="principal" required />
        </Field>
        <Field label="Monthly instalment (RM)" hint="Advance: same as amount">
          <Input type="number" step="0.01" name="installment" required />
        </Field>
      </div>
      <Field label="First deduction (payroll month)">
        <Input type="month" name="startPeriod" defaultValue={next} required />
      </Field>
      <Field label="Reason">
        <Textarea name="reason" />
      </Field>
    </FormModal>
  );
}
