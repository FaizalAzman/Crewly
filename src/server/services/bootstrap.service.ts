import { prisma } from "@/lib/db";
import { HOLIDAYS_2025, HOLIDAYS_2026 } from "../data/holidays";
import { parseDate } from "@/lib/utils";

/** Idempotently loads system (gazetted) public holidays. */
export async function ensureSystemHolidays() {
  const count = await prisma.publicHoliday.count({ where: { tenantId: null } });
  if (count > 0) return;
  await prisma.publicHoliday.createMany({
    data: [...HOLIDAYS_2025, ...HOLIDAYS_2026].map((h) => ({
      tenantId: null,
      date: parseDate(h.date)!,
      name: h.name,
      states: h.states,
      kind: h.kind,
      year: Number(h.date.slice(0, 4)),
    })),
  });
}

export const DEFAULT_LEAVE_TYPES = [
  { code: "AL", name: "Annual Leave", emoji: "🌴", color: "#C6F432", entitlementRule: "EA_ANNUAL", defaultDays: 8, carryForwardMax: 5, statutory: true, minNoticeDays: 3 },
  { code: "SL", name: "Sick Leave", emoji: "🤒", color: "#5CC8FF", entitlementRule: "EA_SICK", defaultDays: 14, requiresAttachment: true, statutory: true },
  { code: "HL", name: "Hospitalisation Leave", emoji: "🏥", color: "#FF8FD8", entitlementRule: "FIXED", defaultDays: 60, requiresAttachment: true, statutory: true, allowHalfDay: false },
  { code: "ML", name: "Maternity Leave", emoji: "🤰", color: "#FFD23F", entitlementRule: "FIXED", defaultDays: 98, gender: "FEMALE", statutory: true, allowHalfDay: false, countsWorkingDaysOnly: false },
  { code: "PL", name: "Paternity Leave", emoji: "👶", color: "#3DDC97", entitlementRule: "FIXED", defaultDays: 7, gender: "MALE", statutory: true, allowHalfDay: false },
  { code: "RL", name: "Replacement Leave", emoji: "🔁", color: "#7C5CFF", entitlementRule: "NONE", defaultDays: 0 },
  { code: "CL", name: "Compassionate Leave", emoji: "🕊️", color: "#E9DCC4", entitlementRule: "FIXED", defaultDays: 3 },
  { code: "MRL", name: "Marriage Leave", emoji: "💍", color: "#FF6B35", entitlementRule: "FIXED", defaultDays: 3, allowHalfDay: false },
  { code: "EXL", name: "Exam Leave", emoji: "📚", color: "#5CC8FF", entitlementRule: "FIXED", defaultDays: 5 },
  { code: "HJL", name: "Hajj / Pilgrimage Leave", emoji: "🕋", color: "#3DDC97", entitlementRule: "FIXED", defaultDays: 0, allowHalfDay: false, countsWorkingDaysOnly: false },
  { code: "UL", name: "Unpaid Leave", emoji: "💸", color: "#FF4D5E", entitlementRule: "NONE", defaultDays: 0, paid: false },
];

export const DEFAULT_PAY_ITEMS = [
  { code: "BASIC", name: "Basic Salary", kind: "EARNING", category: "BASIC", system: true, eaField: "B1a" },
  { code: "ALW_TRANS", name: "Transport Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "ALW_PHONE", name: "Phone Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "ALW_MEAL", name: "Meal Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "ALW_HOUSING", name: "Housing Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "ALW_SHIFT", name: "Shift Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "ALW_REMOTE", name: "Work-from-Home Allowance", kind: "EARNING", category: "ALLOWANCE", eaField: "B1c" },
  { code: "COMM", name: "Commission", kind: "EARNING", category: "COMMISSION", eaField: "B1b" },
  { code: "OT", name: "Overtime", kind: "EARNING", category: "OT", epf: false, hrdf: false, eaField: "B1a" },
  { code: "BONUS", name: "Bonus", kind: "EARNING", category: "BONUS", additional: true, socso: false, eis: false, hrdf: false, eaField: "B1b" },
  { code: "ARREARS", name: "Salary Arrears", kind: "EARNING", category: "OTHER", additional: true, eaField: "B1a" },
  { code: "INCENTIVE", name: "Performance Incentive", kind: "EARNING", category: "BONUS", additional: true, socso: false, eis: false, hrdf: false, eaField: "B1b" },
  { code: "CLAIM", name: "Claims Reimbursement", kind: "EARNING", category: "CLAIM", epf: false, socso: false, eis: false, pcb: false, hrdf: false, system: true },
  { code: "LEAVE_ENCASH", name: "Leave Encashment", kind: "EARNING", category: "OTHER", socso: false, eis: false, additional: true, hrdf: false, eaField: "B1b" },
  { code: "TERM_BENEFIT", name: "Termination Benefit", kind: "EARNING", category: "OTHER", epf: false, socso: false, eis: false, hrdf: false, additional: true, eaField: "B2" },
  { code: "NOTICE_PAY", name: "Notice Pay in Lieu", kind: "EARNING", category: "OTHER", socso: false, eis: false, hrdf: false, additional: true, eaField: "B1a" },
  { code: "LOAN", name: "Loan / Advance Repayment", kind: "DEDUCTION", category: "DEDUCTION", system: true },
  { code: "DED_LATE", name: "Late Deduction", kind: "DEDUCTION", category: "DEDUCTION" },
  { code: "DED_OTHER", name: "Other Deduction", kind: "DEDUCTION", category: "DEDUCTION" },
  { code: "DED_CP38", name: "CP38 Additional Tax", kind: "DEDUCTION", category: "DEDUCTION" },
  { code: "DED_PTPTN", name: "PTPTN Repayment", kind: "DEDUCTION", category: "DEDUCTION" },
];

export const DEFAULT_CLAIM_TYPES = [
  { name: "Medical (Outpatient)", emoji: "💊", category: "MEDICAL", monthlyLimit: 300, yearlyLimit: 1500 },
  { name: "Dental", emoji: "🦷", category: "MEDICAL", yearlyLimit: 500 },
  { name: "Optical", emoji: "👓", category: "MEDICAL", yearlyLimit: 400 },
  { name: "Mileage", emoji: "🚗", category: "MILEAGE", requiresReceipt: false },
  { name: "Toll & Parking", emoji: "🅿️", category: "TRAVEL", monthlyLimit: 500 },
  { name: "Travel & Accommodation", emoji: "✈️", category: "TRAVEL" },
  { name: "Client Entertainment", emoji: "🍜", category: "MEAL", monthlyLimit: 800 },
  { name: "Phone Bill", emoji: "📱", category: "PHONE", monthlyLimit: 150 },
  { name: "Training & Books", emoji: "📚", category: "TRAINING", yearlyLimit: 2000 },
  { name: "Wellness & Gym", emoji: "🏋️", category: "GENERAL", yearlyLimit: 600, taxable: true },
];

export const DEFAULT_SHIFTS = [
  { name: "Office Hours", code: "OFC", startTime: "09:00", endTime: "18:00", breakMinutes: 60, color: "#C6F432" },
  { name: "Early Bird", code: "EAR", startTime: "07:00", endTime: "16:00", breakMinutes: 60, color: "#FFD23F" },
  { name: "Afternoon", code: "AFT", startTime: "14:00", endTime: "23:00", breakMinutes: 60, color: "#5CC8FF" },
  { name: "Night Owl", code: "NGT", startTime: "22:00", endTime: "07:00", breakMinutes: 60, color: "#7C5CFF", overnight: true },
];

export const ONBOARDING_ITEMS: { title: string; owner: string; due: number }[] = [
  { title: "Send welcome email & first-day agenda", owner: "HR", due: -3 },
  { title: "Collect copy of MyKad / passport & bank details", owner: "HR", due: 0 },
  { title: "Register employee with KWSP (EPF) — Borang KWSP 3", owner: "PAYROLL", due: 7 },
  { title: "Register employee with PERKESO (SOCSO & EIS)", owner: "PAYROLL", due: 30 },
  { title: "Submit CP22 to LHDN (within 30 days of hire)", owner: "PAYROLL", due: 30 },
  { title: "Collect TP3 (previous employer YTD) if joined mid-year", owner: "PAYROLL", due: 14 },
  { title: "Prepare laptop, email & system access", owner: "IT", due: -1 },
  { title: "Assign an onboarding buddy", owner: "MANAGER", due: 0 },
  { title: "Set 30-60-90 day goals", owner: "MANAGER", due: 7 },
  { title: "Read & acknowledge company policies", owner: "EMPLOYEE", due: 7 },
  { title: "Enrol in group medical insurance (GHS/GTL)", owner: "HR", due: 14 },
  { title: "Probation review reminder", owner: "MANAGER", due: 80 },
];

export const OFFBOARDING_ITEMS: { title: string; owner: string; due: number }[] = [
  { title: "Acknowledge resignation letter & confirm last working day", owner: "HR", due: 0 },
  { title: "Submit CP22A to LHDN (≥ 30 days before last day)", owner: "PAYROLL", due: -30 },
  { title: "Knowledge handover document", owner: "EMPLOYEE", due: -7 },
  { title: "Return laptop, access card & company assets", owner: "IT", due: 0 },
  { title: "Revoke system access", owner: "IT", due: 0 },
  { title: "Final settlement: leave encashment, claims, loan balance", owner: "PAYROLL", due: 0 },
  { title: "Exit interview", owner: "HR", due: -3 },
  { title: "Issue release letter / certificate of service", owner: "HR", due: 0 },
  { title: "Remove from GHS/GTL insurance", owner: "HR", due: 7 },
];

export const DEFAULT_LETTERS = [
  {
    name: "Offer of Employment",
    category: "OFFER",
    body: `{{today}}

{{employee.fullName}}
{{employee.address}}

Dear {{employee.preferredName}},

OFFER OF EMPLOYMENT — {{employee.jobTitle}}

We are delighted to offer you the position of {{employee.jobTitle}} in the {{employee.department}} department of {{company.name}} ("the Company"), commencing {{employee.joinDate}}.

1. Salary: Your basic salary is {{employee.basicSalary}} per month, payable on or before the 7th of the following month.
2. Probation: You will be on probation for {{employee.probationMonths}} months.
3. Working hours: 9:00 am to 6:00 pm, Monday to Friday (45 hours per week maximum).
4. Leave: Annual leave and sick leave in accordance with the Employment Act 1955 and Company policy.
5. Statutory contributions: EPF, SOCSO and EIS contributions will be made in accordance with the law.
6. Notice: Either party may terminate this contract by giving notice as per the Employment Act 1955, or salary in lieu.

Please sign and return a copy of this letter as your acceptance.

Yours sincerely,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
  {
    name: "Confirmation of Employment",
    category: "CONFIRMATION",
    body: `{{today}}

Dear {{employee.preferredName}},

CONFIRMATION OF EMPLOYMENT

We are pleased to inform you that you have successfully completed your probation. Your employment as {{employee.jobTitle}} is confirmed with effect from {{employee.confirmationDate}}.

All other terms and conditions of your employment remain unchanged. Thank you for your contributions — here's to many more wins together! 🎉

Yours sincerely,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
  {
    name: "Salary Increment Letter",
    category: "INCREMENT",
    body: `{{today}}

Dear {{employee.preferredName}},

SALARY REVISION

In recognition of your performance, we are pleased to inform you that your monthly basic salary has been revised to {{employee.basicSalary}}, effective {{effectiveDate}}.

Keep up the great work!

Yours sincerely,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
  {
    name: "Show Cause Letter",
    category: "SHOW_CAUSE",
    body: `{{today}}

PRIVATE & CONFIDENTIAL

{{employee.fullName}} ({{employee.employeeNo}})
{{employee.jobTitle}}, {{employee.department}}

SHOW CAUSE LETTER

It has been reported that you have committed the following alleged misconduct:

[Describe the alleged misconduct, date, time and place]

You are hereby required to show cause in writing within 72 hours of receiving this letter why disciplinary action should not be taken against you.

Failure to reply within the stipulated time will be deemed as having no explanation to offer, and the Company may proceed with appropriate action.

Yours faithfully,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
  {
    name: "Warning Letter",
    category: "WARNING",
    body: `{{today}}

PRIVATE & CONFIDENTIAL

{{employee.fullName}} ({{employee.employeeNo}})

WARNING LETTER

Following the investigation into [describe matter], the Company has decided to issue you this written warning.

You are reminded that any repetition of such conduct may result in more severe disciplinary action, including dismissal.

Please sign the duplicate copy as acknowledgement of receipt.

Yours faithfully,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
  {
    name: "Certificate of Service",
    category: "EXPERIENCE",
    body: `{{today}}

TO WHOM IT MAY CONCERN

CERTIFICATE OF SERVICE

This is to certify that {{employee.fullName}} (NRIC: {{employee.icNo}}) was employed with {{company.name}} as {{employee.jobTitle}} from {{employee.joinDate}} to {{employee.lastWorkingDate}}.

During the employment, {{employee.preferredName}} was a valued member of the team. We wish {{employee.preferredName}} every success in future endeavours.

Yours faithfully,

[signature]
{{signatory}}
{{signatoryTitle}}
{{company.name}}`,
  },
];

export const DEFAULT_POLICIES = [
  {
    title: "Employee Handbook 2026",
    category: "GENERAL",
    content:
      "Welcome to the team! This handbook covers working hours (max 45 hours/week), leave, claims, code of conduct, flexible working arrangements (EA s.60P), and our commitment to a harassment-free workplace.",
  },
  {
    title: "Anti-Sexual Harassment Policy",
    category: "COMPLIANCE",
    content:
      "We have zero tolerance for sexual harassment. Complaints are handled under Part XVA of the Employment Act 1955: every complaint will be inquired into, and the complainant will be informed within 30 days if the Company decides not to inquire. You can also lodge a complaint with the Anti-Sexual Harassment Tribunal.",
  },
  {
    title: "Personal Data Protection Notice (PDPA 2010)",
    category: "COMPLIANCE",
    content:
      "We process your personal data (including MyKad, bank, EPF, SOCSO and tax details) solely for employment, payroll and statutory purposes, in accordance with the Personal Data Protection Act 2010. You may request access to or correction of your data via HR.",
  },
  {
    title: "Flexible Working Arrangement Policy",
    category: "GENERAL",
    content:
      "Under s.60P of the Employment Act 1955, you may apply in writing to vary your working hours, days or place of work. We will respond in writing within 60 days, with reasons if the application is refused.",
  },
];

/** Creates everything a brand-new workspace needs. */
export async function bootstrapTenant(tenantId: string) {
  await ensureSystemHolidays();
  await prisma.leaveType.createMany({ data: DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, tenantId })) });
  await prisma.payItem.createMany({ data: DEFAULT_PAY_ITEMS.map((p) => ({ ...p, tenantId })) });
  await prisma.claimType.createMany({ data: DEFAULT_CLAIM_TYPES.map((c) => ({ ...c, tenantId })) });
  await prisma.shift.createMany({ data: DEFAULT_SHIFTS.map((s) => ({ ...s, tenantId })) });
  await prisma.letterTemplate.createMany({ data: DEFAULT_LETTERS.map((l) => ({ ...l, tenantId })) });
  await prisma.policy.createMany({ data: DEFAULT_POLICIES.map((p) => ({ ...p, tenantId })) });
  await prisma.checklistTemplate.create({
    data: {
      tenantId,
      name: "Standard Onboarding 🚀",
      type: "ONBOARDING",
      items: { create: ONBOARDING_ITEMS.map((i, idx) => ({ title: i.title, owner: i.owner, dueOffsetDays: i.due, sortOrder: idx })) },
    },
  });
  await prisma.checklistTemplate.create({
    data: {
      tenantId,
      name: "Standard Offboarding 👋",
      type: "OFFBOARDING",
      items: { create: OFFBOARDING_ITEMS.map((i, idx) => ({ title: i.title, owner: i.owner, dueOffsetDays: i.due, sortOrder: idx })) },
    },
  });
  await prisma.jobGrade.createMany({
    data: [
      { tenantId, code: "G1", name: "Associate", minSalary: 1700, midSalary: 2800, maxSalary: 3800 },
      { tenantId, code: "G2", name: "Executive", minSalary: 3500, midSalary: 4800, maxSalary: 6000 },
      { tenantId, code: "G3", name: "Senior Executive", minSalary: 5500, midSalary: 7000, maxSalary: 8500 },
      { tenantId, code: "G4", name: "Manager", minSalary: 8000, midSalary: 10500, maxSalary: 13000 },
      { tenantId, code: "G5", name: "Senior Manager", minSalary: 12000, midSalary: 15500, maxSalary: 19000 },
      { tenantId, code: "G6", name: "Director", minSalary: 18000, midSalary: 25000, maxSalary: 35000 },
    ],
  });
}
