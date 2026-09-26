"use server";

import { redirect } from "next/navigation";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { addChild, confirmEmployee, createEmployee, createLoginForEmployee, extendProbation, updateEmployee, type EmployeeInput } from "@/server/services/employee.service";
import { prisma } from "@/lib/db";
import { assertCan } from "@/server/guard";
import { boolField, dateField, numField, optStr, str } from "@/lib/utils";
import type { ActionState } from "@/server/types";
import { fileOrText } from "@/server/services/upload.service";

function parseEmployeeForm(fd: FormData): EmployeeInput {
  return {
    fullName: str(fd, "fullName"),
    preferredName: optStr(fd, "preferredName"),
    email: str(fd, "email"),
    phone: optStr(fd, "phone"),
    icNo: optStr(fd, "icNo"),
    passportNo: optStr(fd, "passportNo"),
    passportExpiry: dateField(fd, "passportExpiry"),
    dateOfBirth: dateField(fd, "dateOfBirth") ?? undefined,
    gender: (optStr(fd, "gender") as "MALE" | "FEMALE") ?? undefined,
    race: str(fd, "race") || "MALAY",
    religion: str(fd, "religion") || "ISLAM",
    nationality: str(fd, "nationality") || "Malaysia",
    citizenship: (str(fd, "citizenship") || "CITIZEN") as "CITIZEN",
    maritalStatus: (str(fd, "maritalStatus") || "SINGLE") as "SINGLE",
    spouseName: optStr(fd, "spouseName"),
    spouseWorking: boolField(fd, "spouseWorking"),
    spouseDisabled: boolField(fd, "spouseDisabled"),
    disabled: boolField(fd, "disabled"),
    address: optStr(fd, "address"),
    city: optStr(fd, "city"),
    postcode: optStr(fd, "postcode"),
    state: str(fd, "state") || "SELANGOR",
    emergencyName: optStr(fd, "emergencyName"),
    emergencyPhone: optStr(fd, "emergencyPhone"),
    emergencyRelation: optStr(fd, "emergencyRelation"),
    companyId: str(fd, "companyId") || undefined,
    branchId: optStr(fd, "branchId"),
    departmentId: optStr(fd, "departmentId"),
    positionId: optStr(fd, "positionId"),
    gradeId: optStr(fd, "gradeId"),
    managerId: optStr(fd, "managerId"),
    jobTitle: str(fd, "jobTitle"),
    employmentType: (str(fd, "employmentType") || "PERMANENT") as "PERMANENT",
    joinDate: dateField(fd, "joinDate") as Date,
    probationMonths: numField(fd, "probationMonths", 3),
    contractEndDate: dateField(fd, "contractEndDate"),
    basicSalary: numField(fd, "basicSalary"),
    paymentMethod: (str(fd, "paymentMethod") || "BANK") as "BANK",
    bankName: optStr(fd, "bankName"),
    bankAccountNo: optStr(fd, "bankAccountNo"),
    epfNo: optStr(fd, "epfNo"),
    socsoNo: optStr(fd, "socsoNo"),
    taxNo: optStr(fd, "taxNo"),
    taxResident: fd.getAll("taxResident").length ? fd.getAll("taxResident").includes("true") : true,
    zakatMonthly: numField(fd, "zakatMonthly"),
    epfEmployeeRate: str(fd, "epfEmployeeRate") ? numField(fd, "epfEmployeeRate") : null,
    epfEmployerRate: str(fd, "epfEmployerRate") ? numField(fd, "epfEmployerRate") : null,
    hrdfApplicable: boolField(fd, "hrdfApplicable"),
    workHoursPerDay: numField(fd, "workHoursPerDay", 8),
    employeeNo: str(fd, "employeeNo") || undefined,
  };
}

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  let id = "";
  const res = await act(async () => {
    const e = await createEmployee(ctx, parseEmployeeForm(fd), {
      createLogin: boolField(fd, "createLogin"),
      loginPassword: str(fd, "loginPassword") || undefined,
    });
    id = e.id;
    return `${e.fullName} added 🎉`;
  }, ["/employees"]);
  if (res?.ok) redirect(`/employees/${id}?created=1`);
  return res;
}

export async function updateEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  const id = str(fd, "id");
  const res = await act(async () => {
    await updateEmployee(ctx, id, parseEmployeeForm(fd));
    return "Profile updated";
  }, ["/employees", `/employees/${id}`]);
  if (res?.ok) redirect(`/employees/${id}`);
  return res;
}

export async function confirmAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  const id = str(fd, "id");
  return act(async () => {
    await confirmEmployee(ctx, id, dateField(fd, "date") ?? new Date());
    return "Employee confirmed 🎉";
  }, [`/employees/${id}`, "/employees", "/dashboard"]);
}

export async function extendProbationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  const id = str(fd, "id");
  return act(async () => {
    await extendProbation(ctx, id, numField(fd, "months", 1));
    return "Probation extended";
  }, [`/employees/${id}`]);
}

export async function addChildAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const id = str(fd, "employeeId");
  return act(async () => {
    await addChild(ctx, id, { name: str(fd, "name"), dateOfBirth: dateField(fd, "dateOfBirth") ?? new Date(), studying: boolField(fd, "studying"), disabled: boolField(fd, "disabled") });
    return "Child added — PCB child relief updated";
  }, [`/employees/${id}`, "/me"]);
}

export async function removeChildAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  return act(async () => {
    const child = await prisma.employeeChild.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
    if (!child || child.employee.tenantId !== ctx.tenantId) return "Not found";
    await prisma.employeeChild.delete({ where: { id: child.id } });
    return "Removed";
  }, ["/employees"]);
}

export async function addDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  const id = str(fd, "employeeId");
  return act(async () => {
    assertCan(ctx, "employee.manage");
    await prisma.employeeDocument.create({
      data: { employeeId: id, type: str(fd, "type") || "OTHER", name: str(fd, "name"), url: await fileOrText(ctx, fd, "file", "url", "DOCUMENT"), expiryDate: dateField(fd, "expiryDate") },
    });
    return "Document added";
  }, [`/employees/${id}`]);
}

export async function createLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  const id = str(fd, "employeeId");
  return act(async () => {
    await createLoginForEmployee(ctx, id, str(fd, "role") || "EMPLOYEE", str(fd, "password"));
    return "Login created — share the password securely";
  }, [`/employees/${id}`, "/settings"]);
}

export async function addRecurringPayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  const id = str(fd, "employeeId");
  return act(async () => {
    const item = await prisma.payItem.findFirst({ where: { id: str(fd, "payItemId"), tenantId: ctx.tenantId } });
    if (!item) return "Pay item not found";
    await prisma.employeePayItem.create({
      data: { employeeId: id, payItemId: item.id, amount: numField(fd, "amount"), startDate: dateField(fd, "startDate"), endDate: dateField(fd, "endDate") },
    });
    return `${item.name} added`;
  }, [`/employees/${id}`]);
}

export async function removeRecurringPayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  return act(async () => {
    const row = await prisma.employeePayItem.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
    if (!row || row.employee.tenantId !== ctx.tenantId) return "Not found";
    await prisma.employeePayItem.delete({ where: { id: row.id } });
    return "Removed";
  }, ["/employees"]);
}
