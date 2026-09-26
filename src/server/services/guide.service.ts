import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { Ctx } from "../types";

export interface GuideStep {
  key: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface Guide {
  steps: GuideStep[];
  done: number;
  total: number;
  percent: number;
  /** False once every step is done or the user dismissed the checklist. */
  visible: boolean;
}

const APPROVER = ["leave.approve", "claims.approve", "overtime.approve"] as const;

/**
 * "Getting started" checklist for invited users, per role. Like the owner's setup checklist, each step is
 * derived from real data, so it ticks itself off and can't drift. Workspace owners who haven't finished the
 * setup wizard see that instead.
 */
export async function gettingStarted(ctx: Ctx): Promise<Guide> {
  const T = ctx.tenantId;
  const year = new Date().getUTCFullYear();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { guideDismissedAt: true } });
  const steps: GuideStep[] = [];

  if (ctx.employeeId) {
    const id = ctx.employeeId;
    const [emp, tp1, clocked, unacked] = await Promise.all([
      prisma.employee.findUnique({ where: { id }, select: { bankAccountNo: true, phone: true, emergencyName: true, emergencyPhone: true } }),
      prisma.taxDeclaration.count({ where: { employeeId: id, year } }),
      prisma.attendanceRecord.count({ where: { employeeId: id, clockIn: { not: null } } }),
      prisma.policy.count({ where: { tenantId: T, requiresAck: true, acknowledgements: { none: { employeeId: id } } } }),
    ]);
    steps.push(
      {
        key: "profile",
        title: "Check your personal and bank details",
        why: "Your salary goes to this account, and HR needs an emergency contact.",
        href: "/me/profile",
        cta: "Open my profile",
        done: !!(emp?.bankAccountNo && emp.phone && emp.emergencyName && emp.emergencyPhone),
      },
      {
        key: "tp1",
        title: "Declare your tax reliefs (TP1)",
        why: "Reliefs such as insurance, medical and childcare lower the PCB taken from your pay each month.",
        href: "/me/tax",
        cta: "Declare reliefs",
        done: tp1 > 0,
      },
      {
        key: "clock",
        title: "Clock in once",
        why: "See how attendance works. Allow location so your clock-in isn't flagged.",
        href: "/me",
        cta: "Go to clock-in",
        done: clocked > 0,
      },
      {
        key: "policies",
        title: "Read and acknowledge company policies",
        why: "Policies you must acknowledge are waiting under Me.",
        href: "/me",
        cta: "See policies",
        done: unacked === 0,
      },
    );
  }

  if (APPROVER.some((p) => can(ctx, p))) {
    const decided = await Promise.all([
      prisma.leaveRequest.count({ where: { tenantId: T, approverId: ctx.userId } }),
      prisma.claim.count({ where: { tenantId: T, approverId: ctx.userId } }),
      prisma.overtimeRequest.count({ where: { tenantId: T, approverId: ctx.userId } }),
    ]);
    steps.push({
      key: "approvals",
      title: "Decide your first request",
      why: "Leave, claims and overtime from your team land in one inbox. Rejections need a reason.",
      href: "/approvals",
      cta: "Open approvals",
      done: decided.some((n) => n > 0),
    });
  }

  if (can(ctx, "employee.manage")) {
    const active = { tenantId: T, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } };
    const [incomplete, noLogin] = await Promise.all([
      prisma.employee.count({ where: { ...active, OR: [{ bankAccountNo: null }, { AND: [{ icNo: null }, { passportNo: null }] }, { epfNo: null }] } }),
      prisma.employee.count({ where: { ...active, user: null } }),
    ]);
    steps.push(
      {
        key: "records",
        title: "Complete employee records",
        why: incomplete ? `${incomplete} employee(s) are missing a bank account, NRIC/passport or EPF number, which payroll and statutory files need.` : "Every employee has the details payroll needs.",
        href: "/employees",
        cta: "Review employees",
        done: incomplete === 0,
      },
      {
        key: "logins",
        title: "Give everyone a login",
        why: noLogin ? `${noLogin} employee(s) can't see their payslips or apply for leave yet.` : "Everyone can use self-service.",
        href: "/settings?tab=users",
        cta: "Invite people",
        done: noLogin === 0,
      },
    );
  }

  if (can(ctx, "payroll.manage")) {
    const [company, runs] = await Promise.all([
      prisma.company.findFirst({ where: { tenantId: T, isDefault: true }, select: { epfNo: true, socsoNo: true, taxNo: true } }),
      prisma.payrollRun.count({ where: { tenantId: T, status: { not: "DRAFT" } } }),
    ]);
    steps.push(
      {
        key: "employer-numbers",
        title: "Check employer numbers",
        why: "KWSP, PERKESO and LHDN employer numbers appear on payslips and every submission file.",
        href: "/org",
        cta: "Open legal entities",
        done: !!(company?.epfNo && company.socsoNo && company.taxNo),
      },
      {
        key: "payroll",
        title: "Calculate a payroll run",
        why: "Create the month, calculate, then have someone else approve it (maker-checker).",
        href: "/payroll",
        cta: "Go to payroll",
        done: runs > 0,
      },
    );
  }

  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
    visible: total > 0 && done < total && !user.guideDismissedAt,
  };
}

export async function dismissGuide(ctx: Ctx) {
  await prisma.user.update({ where: { id: ctx.userId }, data: { guideDismissedAt: new Date() } });
}
