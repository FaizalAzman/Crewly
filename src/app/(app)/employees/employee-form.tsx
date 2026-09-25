import { prisma } from "@/lib/db";
import type { Employee } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, LinkButton, Select } from "@/components/ui";
import { NricField } from "@/components/nric-field";
import { BANKS, CITIZENSHIP, EMPLOYMENT_TYPES, MARITAL, RACES, RELIGIONS, STATES } from "@/lib/constants";
import { toISODate } from "@/lib/utils";
import type { ActionState } from "@/server/types";

const d = (v?: Date | null) => (v ? toISODate(v) : "");

export async function EmployeeForm({
  tenantId,
  employee,
  action,
}: {
  tenantId: string;
  employee?: Employee | null;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [companies, branches, depts, positions, grades, managers] = await Promise.all([
    prisma.company.findMany({ where: { tenantId }, orderBy: { isDefault: "desc" } }),
    prisma.branch.findMany({ where: { tenantId } }),
    prisma.department.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { tenantId }, orderBy: { title: "asc" } }),
    prisma.jobGrade.findMany({ where: { tenantId }, orderBy: { code: "asc" } }),
    prisma.employee.findMany({ where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, jobTitle: true } }),
  ]);
  const e = employee;
  const isNew = !e;

  return (
    <ActionForm action={action} resetOnSuccess={false} className="space-y-6">
      {e && <input type="hidden" name="id" value={e.id} />}

      <Card>
        <CardHeader title="Personal details" emoji="🪪" subtitle="Used for statutory registration (KWSP, PERKESO, LHDN)" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Full name (as per MyKad / passport)" required className="md:col-span-2">
            <Input name="fullName" defaultValue={e?.fullName} required />
          </Field>
          <Field label="Preferred name">
            <Input name="preferredName" defaultValue={e?.preferredName ?? ""} />
          </Field>
          <Field label="Citizenship" required>
            <Select name="citizenship" defaultValue={e?.citizenship ?? "CITIZEN"} options={CITIZENSHIP.map((c) => ({ value: c, label: c === "PR" ? "Permanent Resident" : c === "CITIZEN" ? "Malaysian citizen" : "Foreigner" }))} />
          </Field>
          <Field label="MyKad (NRIC)" hint="Required for citizens & PRs. Auto-fills DOB and gender.">
            <NricField defaultValue={e?.icNo} />
          </Field>
          <Field label="Passport no." hint="Required for foreigners">
            <Input name="passportNo" defaultValue={e?.passportNo ?? ""} />
          </Field>
          <Field label="Passport expiry">
            <Input type="date" name="passportExpiry" defaultValue={d(e?.passportExpiry)} />
          </Field>
          <Field label="Nationality">
            <Input name="nationality" defaultValue={e?.nationality ?? "Malaysia"} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" name="dateOfBirth" defaultValue={d(e?.dateOfBirth)} />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue={e?.gender ?? "MALE"} options={["MALE", "FEMALE"]} />
          </Field>
          <Field label="Race">
            <Select name="race" defaultValue={e?.race ?? "MALAY"} options={[...RACES]} />
          </Field>
          <Field label="Religion">
            <Select name="religion" defaultValue={e?.religion ?? "ISLAM"} options={[...RELIGIONS]} />
          </Field>
          <Field label="Marital status">
            <Select name="maritalStatus" defaultValue={e?.maritalStatus ?? "SINGLE"} options={[...MARITAL]} />
          </Field>
          <Field label="Spouse name">
            <Input name="spouseName" defaultValue={e?.spouseName ?? ""} />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <Checkbox name="spouseWorking" label="Spouse is working (PCB cat. 3)" defaultChecked={e?.spouseWorking} />
            <Checkbox name="spouseDisabled" label="Spouse is disabled (OKU)" defaultChecked={e?.spouseDisabled} />
            <Checkbox name="disabled" label="Employee is disabled (OKU)" defaultChecked={e?.disabled} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" emoji="📇" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Work email" required>
            <Input type="email" name="email" defaultValue={e?.email} required />
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={e?.phone ?? ""} placeholder="+60 12-345 6789" />
          </Field>
          <div />
          <Field label="Address" className="md:col-span-3">
            <Input name="address" defaultValue={e?.address ?? ""} />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={e?.city ?? ""} />
          </Field>
          <Field label="Postcode">
            <Input name="postcode" defaultValue={e?.postcode ?? ""} />
          </Field>
          <Field label="State">
            <Select name="state" defaultValue={e?.state ?? "SELANGOR"} options={STATES.map((s) => ({ value: s.code, label: s.name }))} />
          </Field>
          <Field label="Emergency contact">
            <Input name="emergencyName" defaultValue={e?.emergencyName ?? ""} />
          </Field>
          <Field label="Emergency phone">
            <Input name="emergencyPhone" defaultValue={e?.emergencyPhone ?? ""} />
          </Field>
          <Field label="Relationship">
            <Input name="emergencyRelation" defaultValue={e?.emergencyRelation ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Job" emoji="💼" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Employee no." hint={isNew ? "Leave blank to auto-generate" : undefined}>
            <Input name="employeeNo" defaultValue={e?.employeeNo ?? ""} disabled={!isNew} />
          </Field>
          <Field label="Job title" required>
            <Input name="jobTitle" defaultValue={e?.jobTitle} required />
          </Field>
          <Field label="Legal entity">
            <Select name="companyId" defaultValue={e?.companyId ?? companies[0]?.id} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Department">
            <Select name="departmentId" defaultValue={e?.departmentId ?? ""} placeholder="—" options={depts.map((x) => ({ value: x.id, label: x.name }))} />
          </Field>
          <Field label="Position">
            <Select name="positionId" defaultValue={e?.positionId ?? ""} placeholder="—" options={positions.map((x) => ({ value: x.id, label: x.title }))} />
          </Field>
          <Field label="Grade">
            <Select name="gradeId" defaultValue={e?.gradeId ?? ""} placeholder="—" options={grades.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))} />
          </Field>
          <Field label="Branch / work location" hint="Its state decides which public holidays apply">
            <Select name="branchId" defaultValue={e?.branchId ?? ""} placeholder="—" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="Reports to">
            <Select name="managerId" defaultValue={e?.managerId ?? ""} placeholder="— No manager —" options={managers.filter((m) => m.id !== e?.id).map((m) => ({ value: m.id, label: `${m.fullName} · ${m.jobTitle}` }))} />
          </Field>
          <Field label="Employment type">
            <Select name="employmentType" defaultValue={e?.employmentType ?? "PERMANENT"} options={[...EMPLOYMENT_TYPES]} />
          </Field>
          <Field label="Join date" required>
            <Input type="date" name="joinDate" defaultValue={d(e?.joinDate)} required />
          </Field>
          <Field label="Probation (months)">
            <Input type="number" name="probationMonths" min={0} max={12} defaultValue={e?.probationMonths ?? 3} />
          </Field>
          <Field label="Contract end date" hint="Required for contract staff">
            <Input type="date" name="contractEndDate" defaultValue={d(e?.contractEndDate)} />
          </Field>
          <Field label="Normal hours / day" hint="Used for OT hourly rate">
            <Input type="number" step="0.5" name="workHoursPerDay" defaultValue={e?.workHoursPerDay ?? 8} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pay & statutory" emoji="🏛️" subtitle="Drives EPF, SOCSO, EIS, PCB and HRD Corp calculations" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Basic salary (RM / month)" required hint="Full-time staff must earn at least RM1,700 (minimum wage)">
            <Input type="number" step="0.01" name="basicSalary" defaultValue={e?.basicSalary} required />
          </Field>
          <Field label="Payment method">
            <Select name="paymentMethod" defaultValue={e?.paymentMethod ?? "BANK"} options={["BANK", "CHEQUE", "CASH"]} />
          </Field>
          <Field label="Bank">
            <Select name="bankName" defaultValue={e?.bankName ?? ""} placeholder="—" options={BANKS} />
          </Field>
          <Field label="Bank account no.">
            <Input name="bankAccountNo" defaultValue={e?.bankAccountNo ?? ""} />
          </Field>
          <Field label="EPF (KWSP) member no.">
            <Input name="epfNo" defaultValue={e?.epfNo ?? ""} />
          </Field>
          <Field label="SOCSO no.">
            <Input name="socsoNo" defaultValue={e?.socsoNo ?? ""} />
          </Field>
          <Field label="Income tax no. (LHDN)">
            <Input name="taxNo" defaultValue={e?.taxNo ?? ""} placeholder="SG 12345678090" />
          </Field>
          <Field label="EPF employee rate override (%)" hint="Blank = statutory rate">
            <Input type="number" step="0.5" name="epfEmployeeRate" defaultValue={e?.epfEmployeeRate ?? ""} />
          </Field>
          <Field label="EPF employer rate override (%)">
            <Input type="number" step="0.5" name="epfEmployerRate" defaultValue={e?.epfEmployerRate ?? ""} />
          </Field>
          <Field label="Zakat via payroll (RM / month)" hint="Deducted from PCB">
            <Input type="number" step="0.01" name="zakatMonthly" defaultValue={e?.zakatMonthly ?? 0} />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1 md:col-span-2">
            <input type="hidden" name="taxResident" value="false" />
            <Checkbox name="taxResident" value="true" label="Tax resident (≥ 182 days in Malaysia). Non-residents are taxed at a flat 30%" defaultChecked={e?.taxResident ?? true} />
            <Checkbox name="hrdfApplicable" label="Subject to HRD Corp levy" defaultChecked={e?.hrdfApplicable ?? true} />
          </div>
        </CardBody>
      </Card>

      {isNew && (
        <Card>
          <CardHeader title="Self-service login" emoji="🔑" />
          <CardBody className="grid gap-4 md:grid-cols-3">
            <div className="flex items-end pb-2">
              <Checkbox name="createLogin" label="Create an employee login now" defaultChecked />
            </div>
            <Field label="Temporary password" hint="At least 8 characters">
              <Input name="loginPassword" type="text" defaultValue="Welcome2026!" />
            </Field>
          </CardBody>
        </Card>
      )}

      <div className="sticky bottom-4 flex justify-end gap-2 rounded-2xl border-2 border-ink bg-card p-3 shadow-brutal">
        <LinkButton href={e ? `/employees/${e.id}` : "/employees"} variant="secondary">
          Cancel
        </LinkButton>
        <SubmitButton pendingText="Saving…">{isNew ? "Add employee" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
