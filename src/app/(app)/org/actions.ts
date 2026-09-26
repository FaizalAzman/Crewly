"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { audit } from "@/server/guard";
import { deleteOrgUnit, setDefaultCompany, type OrgEntity } from "@/server/services/org.service";
import { DomainError, type ActionState } from "@/server/types";
import { boolField, numField, optStr, str } from "@/lib/utils";
import { STATES } from "@/lib/constants";

const P = ["/org", "/employees"];

export async function saveCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = {
      name: str(fd, "name"),
      regNo: optStr(fd, "regNo"),
      epfNo: optStr(fd, "epfNo"),
      socsoNo: optStr(fd, "socsoNo"),
      taxNo: optStr(fd, "taxNo"),
      hrdfNo: optStr(fd, "hrdfNo"),
      hrdfOptIn: boolField(fd, "hrdfOptIn"),
      address: optStr(fd, "address"),
      state: str(fd, "state") || "SELANGOR",
      phone: optStr(fd, "phone"),
    };
    if (!data.name) throw new DomainError("Company name is required.");
    if (!STATES.some((st) => st.code === data.state)) throw new DomainError("Pick the state of the registered address.");
    if (data.epfNo && !/^\d{6,10}$/.test(data.epfNo.replace(/\s/g, ""))) throw new DomainError("EPF employer number should be 6–10 digits.");
    if (id) await prisma.company.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.company.create({ data: { ...data, tenantId: ctx.tenantId } });
    await audit(ctx, id ? "UPDATE" : "CREATE", "Company", id, `Saved legal entity ${data.name}`);
    return "Legal entity saved";
  }, P);
}

export async function saveBranchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const lat = str(fd, "latitude") ? numField(fd, "latitude") : null;
    const lng = str(fd, "longitude") ? numField(fd, "longitude") : null;
    if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) throw new DomainError("Coordinates look invalid.");
    const data = { name: str(fd, "name"), companyId: str(fd, "companyId"), state: str(fd, "state"), address: optStr(fd, "address"), latitude: lat, longitude: lng, geofenceMeters: numField(fd, "geofenceMeters", 200) };
    if (!data.name) throw new DomainError("Branch name is required.");
    if (!STATES.some((st) => st.code === data.state)) throw new DomainError("Pick the branch's state (it decides public holidays).");
    if (data.geofenceMeters < 25 || data.geofenceMeters > 50_000) throw new DomainError("Geofence radius must be between 25 m and 50 km.");
    if (!(await prisma.company.findFirst({ where: { id: data.companyId, tenantId: ctx.tenantId } }))) throw new DomainError("Pick a legal entity.");
    if (id) await prisma.branch.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.branch.create({ data: { ...data, tenantId: ctx.tenantId } });
    return "Branch saved";
  }, P);
}

export async function saveDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const parentId = optStr(fd, "parentId");
    if (id && parentId === id) throw new DomainError("A department can't be its own parent.");
    const data = { name: str(fd, "name"), code: str(fd, "code").toUpperCase(), costCenter: optStr(fd, "costCenter"), color: str(fd, "color") || "#7C5CFF", parentId, headId: optStr(fd, "headId") };
    if (!data.name || !data.code) throw new DomainError("Name and code are required.");
    const dup = await prisma.department.findFirst({ where: { tenantId: ctx.tenantId, code: data.code, NOT: id ? { id } : undefined } });
    if (dup) throw new DomainError("That department code is taken.");
    if (parentId) {
      // Parent must be in this workspace, and must not sit below this department (no loops).
      let cursor: string | null = parentId;
      for (let i = 0; cursor && i < 50; i++) {
        if (cursor === id) throw new DomainError("That would put the department inside itself.");
        const d: { parentId: string | null } | null = await prisma.department.findFirst({ where: { id: cursor, tenantId: ctx.tenantId }, select: { parentId: true } });
        if (!d) throw new DomainError("Parent department not found.");
        cursor = d.parentId;
      }
    }
    if (data.headId && !(await prisma.employee.findFirst({ where: { id: data.headId, tenantId: ctx.tenantId } }))) throw new DomainError("Department head not found.");
    if (id) await prisma.department.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.department.create({ data: { ...data, tenantId: ctx.tenantId } });
    return "Department saved";
  }, P);
}

export async function savePositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = { title: str(fd, "title"), departmentId: optStr(fd, "departmentId"), gradeId: optStr(fd, "gradeId"), headcount: numField(fd, "headcount", 1) };
    if (!data.title) throw new DomainError("Title is required.");
    if (!Number.isInteger(data.headcount) || data.headcount < 0) throw new DomainError("Headcount must be a whole number, 0 or more.");
    if (data.departmentId && !(await prisma.department.findFirst({ where: { id: data.departmentId, tenantId: ctx.tenantId } }))) throw new DomainError("Department not found.");
    if (data.gradeId && !(await prisma.jobGrade.findFirst({ where: { id: data.gradeId, tenantId: ctx.tenantId } }))) throw new DomainError("Grade not found.");
    if (id) await prisma.position.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.position.create({ data: { ...data, tenantId: ctx.tenantId } });
    return "Position saved";
  }, P);
}

export async function saveGradeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = { code: str(fd, "code"), name: str(fd, "name"), minSalary: numField(fd, "minSalary"), midSalary: numField(fd, "midSalary"), maxSalary: numField(fd, "maxSalary") };
    if (!data.code || !data.name) throw new DomainError("Code and name are required.");
    if (data.minSalary <= 0) throw new DomainError("Band minimum must be more than zero.");
    if (!(data.minSalary <= data.midSalary && data.midSalary <= data.maxSalary)) throw new DomainError("Band must satisfy min ≤ mid ≤ max.");
    if (await prisma.jobGrade.findFirst({ where: { tenantId: ctx.tenantId, code: data.code, NOT: id ? { id } : undefined } })) throw new DomainError("That grade code is taken.");
    if (id) await prisma.jobGrade.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.jobGrade.create({ data: { ...data, tenantId: ctx.tenantId } });
    return "Grade saved";
  }, P);
}

export async function deleteOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    await deleteOrgUnit(ctx, str(fd, "kind") as OrgEntity, str(fd, "id"));
    return "Deleted";
  }, P);
}

export async function defaultCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    await setDefaultCompany(ctx, str(fd, "id"));
    return "Default entity updated";
  }, P);
}
