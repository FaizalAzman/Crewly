"use server";

import { redirect } from "next/navigation";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { addCandidate, createJob, hireCandidate, moveCandidate, scheduleInterview, scoreInterview, type Stage } from "@/server/services/talent.service";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/server/types";
import { dateField, numField, optStr, str } from "@/lib/utils";

export async function createJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  return act(async () => {
    await createJob(ctx, {
      title: str(fd, "title"),
      departmentId: optStr(fd, "departmentId"),
      location: str(fd, "location") || "Kuala Lumpur",
      employmentType: str(fd, "employmentType") || "PERMANENT",
      workMode: str(fd, "workMode") || "HYBRID",
      salaryMin: str(fd, "salaryMin") ? numField(fd, "salaryMin") : null,
      salaryMax: str(fd, "salaryMax") ? numField(fd, "salaryMax") : null,
      headcount: numField(fd, "headcount", 1),
      description: optStr(fd, "description") ?? undefined,
      closingDate: dateField(fd, "closingDate"),
    });
    return "Job opening published 🧲";
  }, ["/recruitment"]);
}

export async function setJobStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  return act(async () => {
    await prisma.jobOpening.update({ where: { id: str(fd, "id"), tenantId: ctx.tenantId }, data: { status: str(fd, "status") } });
    return "Status updated";
  }, ["/recruitment"]);
}

export async function addCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  const jobId = str(fd, "jobId");
  return act(async () => {
    await addCandidate(ctx, {
      jobId,
      name: str(fd, "name"),
      email: str(fd, "email"),
      phone: optStr(fd, "phone") ?? undefined,
      source: str(fd, "source") || "LINKEDIN",
      expectedSalary: str(fd, "expectedSalary") ? numField(fd, "expectedSalary") : null,
      currentCompany: optStr(fd, "currentCompany") ?? undefined,
      noticePeriod: optStr(fd, "noticePeriod") ?? undefined,
      notes: optStr(fd, "notes") ?? undefined,
    });
    return "Candidate added";
  }, [`/recruitment/${jobId}`, "/recruitment"]);
}

export async function moveCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  return act(async () => {
    await moveCandidate(ctx, str(fd, "id"), str(fd, "stage") as Stage);
    return `Moved to ${str(fd, "stage").toLowerCase()}`;
  }, [`/recruitment/${str(fd, "jobId")}`, "/recruitment"]);
}

export async function interviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  return act(async () => {
    const at = str(fd, "scheduledAt");
    await scheduleInterview(ctx, { candidateId: str(fd, "candidateId"), scheduledAt: new Date(at), mode: str(fd, "mode") || "VIDEO", interviewer: str(fd, "interviewer") });
    return "Interview scheduled 📅";
  }, [`/recruitment/${str(fd, "jobId")}`]);
}

export async function scoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  return act(async () => {
    await scoreInterview(ctx, str(fd, "id"), numField(fd, "score"), str(fd, "feedback"), str(fd, "recommendation"));
    return "Scorecard saved";
  }, [`/recruitment/${str(fd, "jobId")}`]);
}

export async function hireAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("recruitment.manage");
  let id = "";
  const res = await act(async () => {
    const e = await hireCandidate(ctx, str(fd, "candidateId"), {
      fullName: str(fd, "fullName"),
      email: str(fd, "email"),
      icNo: optStr(fd, "icNo"),
      passportNo: optStr(fd, "passportNo"),
      citizenship: (str(fd, "citizenship") || "CITIZEN") as "CITIZEN",
      jobTitle: str(fd, "jobTitle"),
      joinDate: dateField(fd, "joinDate") as Date,
      basicSalary: numField(fd, "basicSalary"),
      employmentType: (str(fd, "employmentType") || "PERMANENT") as "PERMANENT",
      probationMonths: numField(fd, "probationMonths", 3),
      branchId: optStr(fd, "branchId"),
      managerId: optStr(fd, "managerId"),
      companyId: str(fd, "companyId") || undefined,
    });
    id = e.id;
    return `${e.fullName} hired! Onboarding checklist created 🚀`;
  }, ["/recruitment", "/employees", "/onboarding"]);
  if (res?.ok) redirect(`/employees/${id}`);
  return res;
}
