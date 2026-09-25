/* eslint-disable no-console */
import { prisma } from "../src/lib/db";
import { BRAND } from "../src/lib/brand";
import { parseDate, addDays, todayMY, round2 } from "../src/lib/utils";
import { bootstrapTenant } from "../src/server/services/bootstrap.service";
import { hashPassword } from "../src/server/services/auth.service";
import { createEmployee } from "../src/server/services/employee.service";
import { applyLeave, approveLeave, rejectLeave } from "../src/server/services/leave.service";
import { approvePayrollRun, calculatePayrollRun, createPayrollRun, markPayrollPaid, lockPayrollRun } from "../src/server/services/payroll.service";
import { submitClaim, decideClaim, requestLoan, decideLoan, proposeCompensation } from "../src/server/services/money.service";
import { requestOvertime, decideOvertime } from "../src/server/services/time.service";
import { createSeparation, approveSeparation } from "../src/server/services/lifecycle.service";
import { launchCycle, setGoal, submitSelfReview, submitManagerReview } from "../src/server/services/talent.service";
import { openCase, issueShowCause, fileGrievance, upsertPermit, assignAsset } from "../src/server/services/relations.service";
import { giveKudos, respondSurvey, openTicket, commentTicket } from "../src/server/services/culture.service";
import type { Ctx } from "../src/server/types";

const D = (s: string) => parseDate(s)!;
const PASSWORD = "demo1234";
const domain = BRAND.demoDomain;

// Deterministic PRNG so the demo looks the same every time.
let seed = 42;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const choice = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

type Person = {
  key: string;
  name: string;
  preferred: string;
  ic?: string;
  passport?: string;
  race: string;
  religion: string;
  citizenship?: "CITIZEN" | "PR" | "FOREIGNER";
  nationality?: string;
  marital: "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED";
  spouseWorking?: boolean;
  dept: string;
  title: string;
  grade: string;
  salary: number;
  join: string;
  manager?: string;
  branch: "KL" | "PG" | "JB";
  company?: "MAIN" | "LOGI";
  type?: "PERMANENT" | "CONTRACT" | "PROBATION" | "INTERN" | "PART_TIME";
  role?: string;
  email?: string;
  kids?: { name: string; dob: string; studying?: boolean }[];
  zakat?: number;
  allowances?: [string, number][];
};

const PEOPLE: Person[] = [
  { key: "ceo", name: "Nurul Izzah binti Kamal", preferred: "Izzah", ic: "820314-14-5566", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: true, dept: "LEAD", title: "Chief Executive Officer", grade: "G6", salary: 32000, join: "2019-03-01", branch: "KL", role: "OWNER", email: `ceo@${domain}`, kids: [{ name: "Adam", dob: "2012-05-10" }, { name: "Hana", dob: "2016-11-02" }], zakat: 250, allowances: [["ALW_TRANS", 1500], ["ALW_PHONE", 300]] },
  { key: "aisyah", name: "Aisyah binti Rahman", preferred: "Aisyah", ic: "900215-10-5432", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: true, dept: "PPL", title: "Head of People", grade: "G5", salary: 16500, join: "2019-06-03", manager: "ceo", branch: "KL", role: "HR_ADMIN", kids: [{ name: "Iman", dob: "2019-08-21" }], zakat: 120, allowances: [["ALW_TRANS", 800], ["ALW_PHONE", 150]] },
  { key: "meiling", name: "Tan Mei Ling", preferred: "Mei Ling", ic: "880722-07-5124", race: "CHINESE", religion: "BUDDHISM", marital: "SINGLE", dept: "FIN", title: "Payroll & Finance Manager", grade: "G4", salary: 11800, join: "2020-01-06", manager: "ceo", branch: "KL", role: "PAYROLL", allowances: [["ALW_TRANS", 500], ["ALW_PHONE", 100]] },
  { key: "raj", name: "Rajesh a/l Subramaniam", preferred: "Raj", ic: "870409-08-6371", race: "INDIAN", religion: "HINDUISM", marital: "MARRIED", spouseWorking: false, dept: "ENG", title: "Engineering Manager", grade: "G5", salary: 17500, join: "2020-04-01", manager: "ceo", branch: "KL", role: "MANAGER", kids: [{ name: "Kavin", dob: "2014-02-14" }, { name: "Divya", dob: "2006-07-30", studying: true }], allowances: [["ALW_TRANS", 800], ["ALW_REMOTE", 200]] },
  { key: "danial", name: "Danial bin Hakim", preferred: "Danial", ic: "980126-14-5019", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "ENG", title: "Software Engineer", grade: "G2", salary: 5600, join: "2023-07-03", manager: "raj", branch: "KL", role: "EMPLOYEE", zakat: 30, allowances: [["ALW_REMOTE", 150]] },
  { key: "wei", name: "Lim Wei Jie", preferred: "Wei Jie", ic: "950811-07-5333", race: "CHINESE", religion: "CHRISTIANITY", marital: "SINGLE", dept: "ENG", title: "Senior Software Engineer", grade: "G3", salary: 8800, join: "2021-02-15", manager: "raj", branch: "PG", allowances: [["ALW_REMOTE", 200]] },
  { key: "priya", name: "Priya a/p Ramasamy", preferred: "Priya", ic: "960503-10-6512", race: "INDIAN", religion: "HINDUISM", marital: "MARRIED", spouseWorking: true, dept: "ENG", title: "QA Engineer", grade: "G2", salary: 5200, join: "2022-09-01", manager: "raj", branch: "KL" },
  { key: "hafiz", name: "Muhammad Hafiz bin Zulkifli", preferred: "Hafiz", ic: "970918-01-5871", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "ENG", title: "DevOps Engineer", grade: "G3", salary: 7900, join: "2021-11-01", manager: "raj", branch: "KL", kids: [{ name: "Aqil", dob: "2022-03-03" }], zakat: 60 },
  { key: "jason", name: "Jason Wong Kah Hoe", preferred: "Jason", ic: "000404-10-5567", race: "CHINESE", religion: "NONE", marital: "SINGLE", dept: "ENG", title: "Junior Frontend Developer", grade: "G1", salary: 3800, join: "2026-06-01", manager: "wei", branch: "PG", type: "PROBATION" },
  { key: "farah", name: "Farah Nadiah binti Osman", preferred: "Farah", ic: "990707-03-5566", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "ENG", title: "Software Engineer Intern", grade: "G1", salary: 1800, join: "2026-07-01", manager: "raj", branch: "KL", type: "INTERN" },
  { key: "sarah", name: "Sarah Lee Xin Yi", preferred: "Sarah", ic: "930120-14-5790", race: "CHINESE", religion: "BUDDHISM", marital: "MARRIED", spouseWorking: true, dept: "PRD", title: "Head of Product", grade: "G5", salary: 15800, join: "2020-08-17", manager: "ceo", branch: "KL", allowances: [["ALW_TRANS", 600]] },
  { key: "amir", name: "Amirul Hakim bin Yusof", preferred: "Amir", ic: "950228-06-5325", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "PRD", title: "Product Designer", grade: "G3", salary: 7200, join: "2022-01-10", manager: "sarah", branch: "KL" },
  { key: "grace", name: "Grace Anak Jimbun", preferred: "Grace", ic: "940612-13-5602", race: "BUMIPUTERA_SARAWAK", religion: "CHRISTIANITY", marital: "SINGLE", dept: "PRD", title: "UX Researcher", grade: "G2", salary: 5900, join: "2023-03-01", manager: "sarah", branch: "KL" },
  { key: "kelvin", name: "Kelvin Ng Chee Keong", preferred: "Kelvin", ic: "850930-07-5227", race: "CHINESE", religion: "TAOISM", marital: "MARRIED", spouseWorking: true, dept: "SAL", title: "Head of Sales", grade: "G5", salary: 14000, join: "2020-02-03", manager: "ceo", branch: "KL", kids: [{ name: "Ethan", dob: "2013-09-09" }], allowances: [["ALW_TRANS", 1000], ["ALW_PHONE", 200]] },
  { key: "zul", name: "Zulhelmi bin Abdullah", preferred: "Zul", ic: "910101-02-5089", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "SAL", title: "Account Executive", grade: "G2", salary: 4600, join: "2022-05-16", manager: "kelvin", branch: "KL", kids: [{ name: "Aisy", dob: "2020-01-11" }, { name: "Umar", dob: "2023-06-01" }], allowances: [["ALW_TRANS", 400], ["ALW_PHONE", 80]] },
  { key: "joanne", name: "Joanne Tay Hui Min", preferred: "Joanne", ic: "960214-01-5248", race: "CHINESE", religion: "CHRISTIANITY", marital: "SINGLE", dept: "SAL", title: "Account Executive", grade: "G2", salary: 4500, join: "2023-10-02", manager: "kelvin", branch: "JB", allowances: [["ALW_TRANS", 400]] },
  { key: "suresh", name: "Suresh a/l Muniandy", preferred: "Suresh", ic: "890817-08-5431", race: "INDIAN", religion: "HINDUISM", marital: "DIVORCED", dept: "SAL", title: "Senior Account Manager", grade: "G3", salary: 8200, join: "2021-06-01", manager: "kelvin", branch: "PG", kids: [{ name: "Meera", dob: "2015-12-20" }], allowances: [["ALW_TRANS", 600]] },
  { key: "nadia", name: "Nadia binti Ismail", preferred: "Nadia", ic: "920405-11-5708", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: true, dept: "MKT", title: "Marketing Manager", grade: "G4", salary: 10500, join: "2021-01-04", manager: "ceo", branch: "KL", zakat: 80 },
  { key: "chloe", name: "Chloe Chan Yee Ting", preferred: "Chloe", ic: "990909-14-5100", race: "CHINESE", religion: "NONE", marital: "SINGLE", dept: "MKT", title: "Content Strategist", grade: "G2", salary: 4800, join: "2024-02-01", manager: "nadia", branch: "KL" },
  { key: "hakimi", name: "Hakimi bin Salleh", preferred: "Hakimi", ic: "980330-05-5213", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "MKT", title: "Performance Marketing Executive", grade: "G2", salary: 4300, join: "2024-08-19", manager: "nadia", branch: "KL" },
  { key: "yusri", name: "Yusri bin Mat Noor", preferred: "Yusri", ic: "860612-03-5555", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "FIN", title: "Senior Accountant", grade: "G3", salary: 7600, join: "2020-10-12", manager: "meiling", branch: "KL", kids: [{ name: "Irfan", dob: "2011-04-04" }, { name: "Irdina", dob: "2017-10-10" }, { name: "Ilham", dob: "2004-02-02", studying: true }], zakat: 90 },
  { key: "ivy", name: "Ivy Lau Siew Mei", preferred: "Ivy", ic: "970125-07-5086", race: "CHINESE", religion: "BUDDHISM", marital: "SINGLE", dept: "FIN", title: "Accounts Executive", grade: "G2", salary: 4200, join: "2023-05-02", manager: "meiling", branch: "KL" },
  { key: "shalini", name: "Shalini a/p Krishnan", preferred: "Shalini", ic: "940801-10-6044", race: "INDIAN", religion: "HINDUISM", marital: "SINGLE", dept: "PPL", title: "HR Business Partner", grade: "G3", salary: 7000, join: "2021-09-01", manager: "aisyah", branch: "KL" },
  { key: "azlan", name: "Azlan bin Shah", preferred: "Azlan", ic: "000605-10-5231", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "PPL", title: "Talent Acquisition Executive", grade: "G2", salary: 4000, join: "2025-03-03", manager: "aisyah", branch: "KL" },
  { key: "melissa", name: "Melissa Gomez", preferred: "Mel", ic: "930418-12-5876", race: "BUMIPUTERA_SABAH", religion: "CHRISTIANITY", marital: "MARRIED", spouseWorking: true, dept: "CS", title: "Customer Success Lead", grade: "G3", salary: 7400, join: "2021-07-19", manager: "ceo", branch: "KL", kids: [{ name: "Luke", dob: "2021-12-25" }] },
  { key: "ah-kow", name: "Ong Ah Kow", preferred: "Ah Kow", ic: "650315-07-5139", race: "CHINESE", religion: "BUDDHISM", marital: "MARRIED", spouseWorking: false, dept: "CS", title: "Senior Support Specialist", grade: "G2", salary: 4900, join: "2019-05-02", manager: "melissa", branch: "PG" },
  { key: "siti", name: "Siti Khadijah binti Omar", preferred: "Siti", ic: "960228-03-5362", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: true, dept: "CS", title: "Support Specialist", grade: "G1", salary: 3300, join: "2023-01-09", manager: "melissa", branch: "KL", kids: [{ name: "Maryam", dob: "2024-07-07" }] },
  { key: "arif", name: "Arif bin Hassan", preferred: "Arif", ic: "010811-10-5557", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "CS", title: "Support Specialist", grade: "G1", salary: 2900, join: "2025-10-01", manager: "melissa", branch: "KL" },
  { key: "janet", name: "Janet Lingam", preferred: "Janet", ic: "680920-08-5448", race: "INDIAN", religion: "CHRISTIANITY", marital: "WIDOWED", dept: "PPL", title: "Office Administrator", grade: "G1", salary: 3500, join: "2019-04-15", manager: "aisyah", branch: "KL", type: "CONTRACT" },
  // ── Lumen Logistics (second legal entity) ──
  { key: "fadzil", name: "Fadzil bin Rashid", preferred: "Fadzil", ic: "800808-01-5311", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "OPS", title: "Warehouse Operations Manager", grade: "G4", salary: 9200, join: "2020-06-01", manager: "ceo", branch: "JB", company: "LOGI", kids: [{ name: "Faris", dob: "2010-06-06" }, { name: "Fatin", dob: "2012-02-12" }], zakat: 70 },
  { key: "kumar", name: "Kumaran a/l Rajoo", preferred: "Kumar", ic: "880214-01-5997", race: "INDIAN", religion: "HINDUISM", marital: "MARRIED", spouseWorking: true, dept: "OPS", title: "Warehouse Supervisor", grade: "G2", salary: 4400, join: "2021-03-15", manager: "fadzil", branch: "JB", company: "LOGI" },
  { key: "lee", name: "Lee Chong Wei Ming", preferred: "Chong", ic: "920707-01-5203", race: "CHINESE", religion: "BUDDHISM", marital: "SINGLE", dept: "OPS", title: "Logistics Coordinator", grade: "G2", salary: 3900, join: "2022-11-01", manager: "fadzil", branch: "JB", company: "LOGI" },
  { key: "razak", name: "Abdul Razak bin Ahmad", preferred: "Razak", ic: "660525-01-5423", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "OPS", title: "Forklift Operator", grade: "G1", salary: 2400, join: "2018-09-03", manager: "kumar", branch: "JB", company: "LOGI", zakat: 20 },
  { key: "ismail", name: "Ismail bin Daud", preferred: "Ismail", ic: "020101-01-5779", race: "MALAY", religion: "ISLAM", marital: "SINGLE", dept: "OPS", title: "Warehouse Assistant", grade: "G1", salary: 1900, join: "2025-01-06", manager: "kumar", branch: "JB", company: "LOGI" },
  { key: "rahim", name: "Md Rahim Uddin", preferred: "Rahim", passport: "BD0412233", race: "OTHERS", religion: "ISLAM", citizenship: "FOREIGNER", nationality: "Bangladesh", marital: "MARRIED", spouseWorking: false, dept: "OPS", title: "General Worker", grade: "G1", salary: 1900, join: "2023-02-01", manager: "kumar", branch: "JB", company: "LOGI" },
  { key: "bishnu", name: "Bishnu Tamang", preferred: "Bishnu", passport: "NP0983321", race: "OTHERS", religion: "HINDUISM", citizenship: "FOREIGNER", nationality: "Nepal", marital: "SINGLE", dept: "OPS", title: "General Worker", grade: "G1", salary: 1850, join: "2023-08-14", manager: "kumar", branch: "JB", company: "LOGI" },
  { key: "budi", name: "Budi Santoso", preferred: "Budi", passport: "ID8812334", race: "OTHERS", religion: "ISLAM", citizenship: "FOREIGNER", nationality: "Indonesia", marital: "MARRIED", spouseWorking: false, dept: "OPS", title: "Packer", grade: "G1", salary: 1800, join: "2024-04-01", manager: "kumar", branch: "JB", company: "LOGI" },
  { key: "aung", name: "Aung Kyaw Min", preferred: "Aung", passport: "MM4455211", race: "OTHERS", religion: "BUDDHISM", citizenship: "FOREIGNER", nationality: "Myanmar", marital: "SINGLE", dept: "OPS", title: "Packer", grade: "G1", salary: 1750, join: "2024-10-01", manager: "kumar", branch: "JB", company: "LOGI" },
  { key: "arjun", name: "Arjun Mehta", preferred: "Arjun", passport: "IN7788990", race: "OTHERS", religion: "HINDUISM", citizenship: "FOREIGNER", nationality: "India", marital: "MARRIED", spouseWorking: true, dept: "ENG", title: "Staff Engineer (EP)", grade: "G5", salary: 18500, join: "2024-01-15", manager: "raj", branch: "KL" },
  { key: "liza", name: "Liza Tan Poh Lin", preferred: "Liza", ic: "750505-10-5128", race: "CHINESE", religion: "CHRISTIANITY", citizenship: "PR", nationality: "Singapore", marital: "MARRIED", spouseWorking: true, dept: "FIN", title: "Financial Controller", grade: "G5", salary: 15200, join: "2020-03-02", manager: "ceo", branch: "KL" },
  { key: "ramli", name: "Ramli bin Yaakob", preferred: "Ramli", ic: "640707-11-5381", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: false, dept: "CS", title: "Driver / Dispatch", grade: "G1", salary: 2300, join: "2017-02-01", manager: "melissa", branch: "KL" },
  { key: "yee", name: "Chew Yee Wen", preferred: "Yee Wen", ic: "031212-14-5022", race: "CHINESE", religion: "BUDDHISM", marital: "SINGLE", dept: "MKT", title: "Marketing Intern", grade: "G1", salary: 1500, join: "2026-08-03", manager: "nadia", branch: "KL", type: "INTERN" },
  { key: "hana", name: "Nur Hana binti Aziz", preferred: "Hana", ic: "951010-06-5400", race: "MALAY", religion: "ISLAM", marital: "MARRIED", spouseWorking: true, dept: "PRD", title: "Product Manager", grade: "G4", salary: 10200, join: "2022-04-04", manager: "sarah", branch: "KL" },
  { key: "daniel", name: "Daniel Fernandez", preferred: "Daniel", ic: "910303-10-5591", race: "OTHERS", religion: "CHRISTIANITY", marital: "SINGLE", dept: "SAL", title: "Partnerships Manager", grade: "G4", salary: 9800, join: "2025-05-05", manager: "kelvin", branch: "KL" },
];

async function main() {
  console.log("🌱 Seeding demo workspace…");
  // Clean slate for the demo tenant only.
  const existing = await prisma.tenant.findUnique({ where: { slug: "lumen-digital" } });
  for (const model of [
    "leaveRequest", "rosterEntry", "attendanceRecord", "overtimeRequest", "payrollAdjustment", "payrollRun", "claim", "loan", "compensationChange",
    "department", "jobGrade", "position", "branch", "leaveType", "payItem", "claimType", "shift", "checklistTemplate", "checklist", "letterTemplate",
    "generatedLetter", "policy", "announcement", "kudos", "survey", "ticket", "separation", "reviewCycle", "goal", "performanceReview",
    "trainingProgram", "asset", "disciplinaryCase", "grievance", "workPermit", "benefitPlan", "panelClinic", "candidate", "jobOpening",
    "publicHoliday", "employee",
  ] as const) {
    // tenant-scoped tables without FK cascade from Tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing) await (prisma as any)[model].deleteMany({ where: { tenantId: existing.id } });
  }
  if (existing) await prisma.tenant.delete({ where: { id: existing.id } });

  const tenant = await prisma.tenant.create({
    data: { name: "Lumen Digital", slug: "lumen-digital", plan: "GROWTH", seats: 60, trialEndsAt: null, restDay: 0, offDay: 6, workDaysPerWeek: 5 },
  });
  const T = tenant.id;
  await bootstrapTenant(T);

  const main = await prisma.company.create({
    data: {
      tenantId: T, name: BRAND.demoCompany, regNo: "201901012345 (1321456-K)", epfNo: "019283746", socsoNo: "E1000123456Z", taxNo: "E 9123456708",
      hrdfNo: "HRD-1000123", address: "Level 18, The Vertical, Bangsar South, 59200 Kuala Lumpur", state: "KUALA_LUMPUR", phone: "+60 3-2201 8800", isDefault: true,
    },
  });
  const logi = await prisma.company.create({
    data: {
      tenantId: T, name: "Lumen Logistics Sdn Bhd", regNo: "202001023456 (1378901-A)", epfNo: "019283999", socsoNo: "E1000987654X", taxNo: "E 9876543201",
      hrdfNo: "HRD-1000987", address: "Lot 12, Jalan Perindustrian 3, Tebrau, 81100 Johor Bahru", state: "JOHOR", phone: "+60 7-355 1200",
    },
  });
  const branches = {
    KL: await prisma.branch.create({ data: { tenantId: T, companyId: main.id, name: "KL HQ · Bangsar South", state: "KUALA_LUMPUR", address: "The Vertical, Bangsar South", latitude: 3.1106, longitude: 101.6653, geofenceMeters: 250 } }),
    PG: await prisma.branch.create({ data: { tenantId: T, companyId: main.id, name: "Penang Hub · Bayan Lepas", state: "PULAU_PINANG", address: "Bayan Lepas Technoplex", latitude: 5.2945, longitude: 100.2593, geofenceMeters: 200 } }),
    JB: await prisma.branch.create({ data: { tenantId: T, companyId: logi.id, name: "JB Warehouse · Tebrau", state: "JOHOR", address: "Tebrau Industrial Park", latitude: 1.5446, longitude: 103.7915, geofenceMeters: 300 } }),
  };

  const deptDefs: [string, string, string, string][] = [
    ["LEAD", "Leadership", "CC-100", "#16140F"],
    ["ENG", "Engineering", "CC-200", "#7C5CFF"],
    ["PRD", "Product & Design", "CC-210", "#FF8FD8"],
    ["SAL", "Sales", "CC-300", "#FF6B35"],
    ["MKT", "Marketing", "CC-310", "#FFD23F"],
    ["CS", "Customer Success", "CC-320", "#5CC8FF"],
    ["FIN", "Finance", "CC-400", "#3DDC97"],
    ["PPL", "People", "CC-410", "#C6F432"],
    ["OPS", "Warehouse Operations", "CC-500", "#B69CFF"],
  ];
  const depts: Record<string, string> = {};
  for (const [code, name, cc, color] of deptDefs) depts[code] = (await prisma.department.create({ data: { tenantId: T, code, name, costCenter: cc, color } })).id;
  const grades = Object.fromEntries((await prisma.jobGrade.findMany({ where: { tenantId: T } })).map((g) => [g.code, g.id]));

  // System context (acts as HR admin during seeding)
  const sys: Ctx = { tenantId: T, userId: "seed", userName: "Seeder", role: "OWNER", employeeId: null };
  const ids: Record<string, string> = {};
  const passwordHash = await hashPassword(PASSWORD);
  const payItems = Object.fromEntries((await prisma.payItem.findMany({ where: { tenantId: T } })).map((p) => [p.code, p.id]));
  const colors = ["#FFD23F", "#C6F432", "#5CC8FF", "#FF8FD8", "#FF6B35", "#3DDC97", "#B69CFF", "#FFB4A2"];

  for (const [i, p] of PEOPLE.entries()) {
    const email = p.email ?? `${p.key.replace(/[^a-z]/g, "")}@${domain}`;
    const e = await createEmployee(
      sys,
      {
        fullName: p.name,
        preferredName: p.preferred,
        email,
        phone: `+60 1${between(0, 9)}-${between(100, 999)} ${between(1000, 9999)}`,
        icNo: p.ic ?? null,
        passportNo: p.passport ?? null,
        passportExpiry: p.passport ? addDays(todayMY(), between(200, 1500)) : null,
        dateOfBirth: p.passport ? D(`19${between(85, 99)}-0${between(1, 9)}-1${between(0, 9)}`) : undefined,
        gender: ["priya", "aisyah", "meiling", "grace", "sarah", "joanne", "nadia", "chloe", "ivy", "shalini", "melissa", "siti", "janet", "farah", "ceo", "liza", "yee", "hana"].includes(p.key) ? "FEMALE" : "MALE",
        race: p.race,
        religion: p.religion,
        nationality: p.nationality ?? "Malaysia",
        citizenship: p.citizenship ?? "CITIZEN",
        maritalStatus: p.marital,
        spouseName: p.marital === "MARRIED" ? "(on file)" : null,
        spouseWorking: p.spouseWorking ?? false,
        address: choice(["Jalan Telawi 3, Bangsar", "Jalan SS2/24, Petaling Jaya", "Persiaran Gurney, George Town", "Jalan Austin Heights, Johor Bahru", "Jalan Ampang, Kuala Lumpur", "Jalan Tun Razak, Kuala Lumpur"]),
        city: p.branch === "PG" ? "George Town" : p.branch === "JB" ? "Johor Bahru" : "Kuala Lumpur",
        postcode: p.branch === "PG" ? "10250" : p.branch === "JB" ? "81100" : "59200",
        state: p.branch === "PG" ? "PULAU_PINANG" : p.branch === "JB" ? "JOHOR" : "KUALA_LUMPUR",
        emergencyName: choice(["Rohani", "Ahmad", "Lim Siew", "Muthu", "Mary", "Hassan"]),
        emergencyPhone: `+60 12-${between(100, 999)} ${between(1000, 9999)}`,
        emergencyRelation: choice(["Spouse", "Parent", "Sibling"]),
        companyId: p.company === "LOGI" ? logi.id : main.id,
        branchId: branches[p.branch].id,
        departmentId: depts[p.dept],
        gradeId: grades[p.grade],
        managerId: p.manager ? ids[p.manager] : null,
        jobTitle: p.title,
        employmentType: p.type ?? "PERMANENT",
        joinDate: D(p.join),
        probationMonths: p.type === "PROBATION" ? 6 : p.type === "INTERN" ? 0 : 3,
        contractEndDate: p.type === "CONTRACT" ? D("2027-04-14") : null,
        basicSalary: p.salary,
        bankName: choice(["Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "GXBank"]),
        bankAccountNo: String(between(100000000, 999999999)) + String(between(100, 999)),
        epfNo: String(between(10000000, 29999999)),
        socsoNo: p.ic ? p.ic.replace(/-/g, "") : null,
        taxNo: p.salary > 3000 ? `SG ${between(10000000000, 99999999999)}` : null,
        taxResident: true,
        zakatMonthly: p.zakat ?? 0,
        hrdfApplicable: (p.citizenship ?? "CITIZEN") === "CITIZEN",
        employeeNo: `LD${String(i + 1).padStart(4, "0")}`,
      },
      { skipOnboarding: new Date(p.join) < new Date("2026-06-01") },
    );
    ids[p.key] = e.id;
    await prisma.employee.update({ where: { id: e.id }, data: { avatarColor: colors[i % colors.length] } });

    // Older employees are confirmed.
    if (e.status === "PROBATION" && D(p.join) < D("2026-03-01")) {
      await prisma.employee.update({ where: { id: e.id }, data: { status: "ACTIVE" } });
    }
    for (const k of p.kids ?? []) await prisma.employeeChild.create({ data: { employeeId: e.id, name: k.name, dateOfBirth: D(k.dob), studying: k.studying ?? false } });
    for (const [code, amt] of p.allowances ?? []) await prisma.employeePayItem.create({ data: { employeeId: e.id, payItemId: payItems[code], amount: amt } });
    if (p.role) {
      await prisma.user.create({ data: { tenantId: T, email, name: p.name, role: p.role, employeeId: e.id, passwordHash } });
    }
  }
  // Also give most employees a self-service login.
  for (const p of PEOPLE.filter((x) => !x.role)) {
    const email = `${p.key.replace(/[^a-z]/g, "")}@${domain}`;
    await prisma.user.create({ data: { tenantId: T, email, name: p.name, role: "EMPLOYEE", employeeId: ids[p.key], passwordHash } });
  }
  for (const [code, key] of [["ENG", "raj"], ["PPL", "aisyah"], ["FIN", "meiling"], ["SAL", "kelvin"], ["MKT", "nadia"], ["PRD", "sarah"], ["CS", "melissa"], ["OPS", "fadzil"], ["LEAD", "ceo"]]) {
    await prisma.department.update({ where: { id: depts[code] }, data: { headId: ids[key] } });
  }
  const users = Object.fromEntries((await prisma.user.findMany({ where: { tenantId: T } })).map((u) => [u.employeeId!, u]));
  const ctxOf = (key: string): Ctx => {
    const u = users[ids[key]];
    return { tenantId: T, userId: u.id, userName: u.name, role: u.role as Ctx["role"], employeeId: ids[key] };
  };
  const hr = ctxOf("aisyah");
  /** The employee's manager if they hold an approving role, otherwise HR. */
  const approverFor = (key: string): Ctx => {
    const mgr = PEOPLE.find((p) => p.key === key)?.manager;
    const u = mgr ? users[ids[mgr]] : undefined;
    return u && ["MANAGER", "HR_ADMIN", "OWNER"].includes(u.role) ? ctxOf(mgr!) : hr;
  };
  const payroll = ctxOf("meiling");
  const raj = ctxOf("raj");
  console.log(`  ✓ ${PEOPLE.length} employees`);

  // Positions
  for (const p of PEOPLE) {
    const exists = await prisma.position.findFirst({ where: { tenantId: T, title: p.title } });
    const pos = exists ?? (await prisma.position.create({ data: { tenantId: T, title: p.title, departmentId: depts[p.dept], gradeId: grades[p.grade], headcount: 1 } }));
    if (exists) await prisma.position.update({ where: { id: exists.id }, data: { headcount: { increment: 1 } } });
    await prisma.employee.update({ where: { id: ids[p.key] }, data: { positionId: pos.id } });
  }

  // TP3 for a mid-year joiner & TP1 reliefs for a few
  await prisma.taxDeclaration.create({ data: { employeeId: ids.jason, year: 2026, prevGross: 16500, prevEpf: 1815, prevPcb: 45, lifestyle: 2500 } });
  await prisma.taxDeclaration.create({ data: { employeeId: ids.danial, year: 2026, lifestyle: 2500, medicalSelf: 800, prs: 3000, sports: 500 } });
  await prisma.taxDeclaration.create({ data: { employeeId: ids.raj, year: 2026, education: 7000, lifeInsurance: 3000, medicalParents: 5000, sspn: 4000 } });

  // ── Leave ──
  const lt = Object.fromEntries((await prisma.leaveType.findMany({ where: { tenantId: T } })).map((t) => [t.code, t.id]));
  const leaveSeeds: [string, string, string, string, string, "APPROVED" | "PENDING" | "REJECTED", string?][] = [
    ["danial", "AL", "2026-04-06", "2026-04-08", "Balik kampung for Raya", "APPROVED"],
    ["danial", "SL", "2026-08-12", "2026-08-12", "Fever", "APPROVED", "MC-KL-88213"],
    ["danial", "AL", "2026-10-19", "2026-10-21", "Trip to Langkawi 🏝️", "PENDING"],
    ["wei", "AL", "2026-07-20", "2026-07-24", "Family holiday", "APPROVED"],
    ["wei", "AL", "2026-12-21", "2026-12-24", "Christmas with family", "PENDING"],
    ["priya", "AL", "2026-09-28", "2026-09-30", "Wedding anniversary", "PENDING"],
    ["priya", "SL", "2026-09-10", "2026-09-11", "Migraine", "APPROVED", "MC-KL-99102"],
    ["hafiz", "PL", "2026-05-11", "2026-05-15", "Baby #2 arrived!", "APPROVED"],
    ["amir", "AL", "2026-09-25", "2026-09-25", "Personal errands", "APPROVED"],
    ["grace", "AL", "2026-06-01", "2026-06-05", "Gawai in Kuching", "APPROVED"],
    ["zul", "AL", "2026-09-24", "2026-09-24", "Kids' sports day", "APPROVED"],
    ["zul", "UL", "2026-09-08", "2026-09-09", "Extended family matter", "APPROVED"],
    ["joanne", "AL", "2026-10-05", "2026-10-09", "Japan trip 🇯🇵", "PENDING"],
    ["suresh", "AL", "2026-11-09", "2026-11-11", "Deepavali", "PENDING"],
    ["chloe", "SL", "2026-09-22", "2026-09-23", "Flu", "APPROVED", "MC-PJ-10021"],
    ["siti", "AL", "2026-09-24", "2026-09-29", "Family trip to Terengganu", "APPROVED"],
    ["ivy", "AL", "2026-08-17", "2026-08-19", "Staycation", "REJECTED"],
    ["kumar", "AL", "2026-09-29", "2026-10-02", "Temple festival", "PENDING"],
    ["lee", "CL", "2026-07-06", "2026-07-07", "Grandmother passed away", "APPROVED"],
    ["melissa", "AL", "2026-09-21", "2026-09-26", "Sabah home visit", "APPROVED"],
    ["hakimi", "EXL", "2026-10-12", "2026-10-13", "Professional certification exam", "PENDING"],
  ];
  for (const [key, code, s, e, reason, status, att] of leaveSeeds) {
    const r = await applyLeave(hr, { employeeId: ids[key], leaveTypeId: lt[code], startDate: D(s), endDate: D(e), reason, attachment: att ?? null }, { onBehalf: true });
    const approver = approverFor(key);
    if (status === "APPROVED") await approveLeave(approver, r.id, "Enjoy!");
    if (status === "REJECTED") await rejectLeave(approver, r.id, "Month-end closing — can we move it by a week?");
  }
  console.log("  ✓ leave");

  // ── Attendance: last 25 days ──
  const today = todayMY();
  const onLeave = await prisma.leaveRequest.findMany({ where: { tenantId: T, status: "APPROVED" } });
  const rows = [];
  for (const p of PEOPLE) {
    for (let d = 25; d >= 0; d--) {
      const date = addDays(today, -d);
      const dow = date.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (date < D(p.join)) continue;
      if (onLeave.some((l) => l.employeeId === ids[p.key] && l.startDate <= date && l.endDate >= date)) continue;
      if (["2026-09-16", "2026-08-31"].includes(date.toISOString().slice(0, 10))) continue;
      const isToday = d === 0;
      const lateBias = p.key === "hakimi" || p.key === "arif" ? 25 : 0;
      const inMin = 8 * 60 + 35 + between(0, 45) + (rand() < 0.15 ? lateBias : 0);
      const clockIn = new Date(date.getTime() + (inMin - 8 * 60) * 60000);
      const outMin = 17 * 60 + 55 + between(0, 90);
      const clockOut = isToday ? null : new Date(date.getTime() + (outMin - 8 * 60) * 60000);
      const late = Math.max(0, inMin - (9 * 60 + 10));
      rows.push({
        tenantId: T,
        employeeId: ids[p.key],
        date,
        clockIn,
        clockOut,
        inLat: branches[p.branch].latitude! + (rand() - 0.5) * 0.001,
        inLng: branches[p.branch].longitude! + (rand() - 0.5) * 0.001,
        withinFence: rand() > 0.03,
        status: late > 0 ? "LATE" : "PRESENT",
        lateMinutes: late > 0 ? inMin - 9 * 60 : 0,
        workedMinutes: clockOut ? outMin - inMin - 60 : 0,
        source: choice(["WEB", "MOBILE", "MOBILE"]),
      });
    }
  }
  // Leave a couple of people not clocked in today so the dashboard shows "not in yet".
  await prisma.attendanceRecord.createMany({ data: rows.filter((r) => !(r.date.getTime() === today.getTime() && ["arif", "hakimi", "jason"].includes(PEOPLE.find((p) => ids[p.key] === r.employeeId)!.key))) });
  console.log(`  ✓ attendance (${rows.length} records)`);

  // ── Overtime (warehouse) ──
  const otSeeds: [string, string, number, number, boolean | null][] = [
    ["razak", "2026-06-13", 0, 6, true],
    ["razak", "2026-07-15", 3, 0, true],
    ["ismail", "2026-08-31", 4, 8, true],
    ["rahim", "2026-09-05", 0, 5, true],
    ["bishnu", "2026-09-16", 2, 8, true],
    ["budi", "2026-09-19", 0, 4, null],
    ["kumar", "2026-09-22", 3, 0, null],
    ["aung", "2026-09-23", 2.5, 0, null],
    ["lee", "2026-09-24", 2, 0, false],
  ];
  for (const [key, date, ot, normal, decision] of otSeeds) {
    // rest-day/PH normal hours only apply on those days — the service decides the day type
    const dt = D(date);
    const isNormalDay = dt.getUTCDay() !== 0 && !["2026-08-31", "2026-09-16"].includes(date);
    const r = await requestOvertime(hr, { employeeId: ids[key], date: dt, hours: ot || (isNormalDay ? 2 : 0), normalHours: isNormalDay ? 0 : normal, reason: choice(["Peak season orders", "Container unloading", "Stock take", "Urgent customer shipment"]) });
    if (decision !== null) await decideOvertime(hr, r.id, decision);
  }
  console.log("  ✓ overtime");

  // ── Claims ──
  const ct = Object.fromEntries((await prisma.claimType.findMany({ where: { tenantId: T } })).map((c) => [c.name, c.id]));
  const claimSeeds: [string, string, string, number, string, string | null, (boolean | null)?, number?][] = [
    ["danial", "Medical (Outpatient)", "2026-08-12", 85, "Clinic visit — fever", "Klinik Mediviron Bangsar", true],
    ["danial", "Wellness & Gym", "2026-09-02", 150, "Monthly gym membership", "Anytime Fitness", true],
    ["zul", "Mileage", "2026-09-15", 0, "Client visits in Shah Alam & Klang", null, true, 96],
    ["zul", "Toll & Parking", "2026-09-15", 42.6, "Tolls for client visits", "Touch 'n Go", true],
    ["joanne", "Client Entertainment", "2026-09-18", 238.5, "Lunch with Iskandar Holdings", "Restoran Hua Mui", null],
    ["suresh", "Travel & Accommodation", "2026-09-10", 612, "KL client pitch — flight + hotel", "AirAsia / Hotel Stripes", true],
    ["kelvin", "Phone Bill", "2026-09-01", 138, "Postpaid bill Aug", "CelcomDigi", true],
    ["wei", "Training & Books", "2026-09-19", 189, "System Design book + course", "Kinokuniya", null],
    ["priya", "Dental", "2026-09-12", 180, "Scaling & polishing", "Klinik Pergigian Smile", null],
    ["hakimi", "Mileage", "2026-09-20", 0, "Event venue recce — Putrajaya", null, null, 64],
    ["siti", "Medical (Outpatient)", "2026-07-03", 60, "Child's fever (clinic)", "Klinik Kesihatan", true],
    ["melissa", "Optical", "2026-07-22", 350, "New glasses", "Focus Point", true],
    ["arif", "Client Entertainment", "2026-09-23", 380, "Team dinner", "Restoran Rebung", false],
  ];
  for (const [key, type, date, amt, desc, merchant, decision, km] of claimSeeds) {
    const c = await submitClaim(hr, {
      employeeId: ids[key],
      claimTypeId: ct[type],
      date: D(date),
      amount: amt,
      mileageKm: km ?? null,
      description: desc,
      merchant,
      receiptUrl: type === "Mileage" ? null : `receipt-${key}-${date}.jpg`,
    }).catch((e) => {
      console.log(`    (skipped claim for ${key}: ${e.message})`);
      return null;
    });
    if (!c || decision === null || decision === undefined) continue;
    await decideClaim(approverFor(key), c.id, decision, decision ? undefined : "Please use the team-building budget instead.");
  }
  console.log("  ✓ claims");

  // ── Loans ──
  const loan1 = await requestLoan(hr, { employeeId: ids.razak, type: "STAFF_LOAN", principal: 3000, installment: 250, startPeriod: "2026-06", reason: "Motorcycle repair" });
  await decideLoan(hr, loan1.id, true);
  const loan2 = await requestLoan(hr, { employeeId: ids.siti, type: "SALARY_ADVANCE", principal: 800, installment: 800, startPeriod: "2026-09", reason: "School fees" });
  await decideLoan(hr, loan2.id, true);
  await requestLoan(hr, { employeeId: ids.hakimi, type: "SALARY_ADVANCE", principal: 1000, installment: 1000, startPeriod: "2026-10", reason: "Car insurance renewal" });
  console.log("  ✓ loans");

  // ── Payroll: Jun – Aug paid, Sep calculated ──
  // Bonus for August (mid-year performance bonus) as additional remuneration
  for (const key of ["danial", "wei", "hafiz", "priya", "zul", "suresh"]) {
    await prisma.payrollAdjustment.create({ data: { tenantId: T, employeeId: ids[key], payItemId: payItems.BONUS, period: "2026-08", amount: round2(PEOPLE.find((p) => p.key === key)!.salary * 0.5), note: "Mid-year bonus" } });
  }
  await prisma.payrollAdjustment.create({ data: { tenantId: T, employeeId: ids.kelvin, payItemId: payItems.COMM, period: "2026-09", amount: 4200, note: "Q3 commission" } });
  await prisma.payrollAdjustment.create({ data: { tenantId: T, employeeId: ids.zul, payItemId: payItems.COMM, period: "2026-09", amount: 1350, note: "Q3 commission" } });
  await prisma.payrollAdjustment.create({ data: { tenantId: T, employeeId: ids.arif, payItemId: payItems.DED_LATE, period: "2026-09", amount: 50, note: "Repeated lateness (per policy)" } });

  const payDay = (period: string) => D(`${period}-28`);
  for (const company of [main, logi]) {
    for (const period of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) {
      const run = await createPayrollRun(payroll, { companyId: company.id, period, payDate: payDay(period) });
      await calculatePayrollRun(payroll, run.id);
      if (period === "2026-09") continue;
      await approvePayrollRun(hr, run.id);
      await markPayrollPaid(hr, run.id);
      if (period < "2026-08") await lockPayrollRun(hr, run.id);
    }
  }
  console.log("  ✓ payroll Jan–Sep 2026 (both entities)");

  // ── Compensation proposals ──
  await proposeCompensation(hr, { employeeId: ids.danial, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 6100, reason: "Mid-year review: exceeds expectations" });
  await proposeCompensation(hr, { employeeId: ids.amir, type: "PROMOTION", effectiveDate: D("2026-10-01"), newSalary: 8600, newTitle: "Senior Product Designer", reason: "Led design system rollout" });

  // ── Separations ──
  const sep = await createSeparation(hr, { employeeId: ids.hakimi, type: "RESIGNATION", noticeDate: D("2026-09-15"), lastWorkingDate: D("2026-10-14"), reason: "Pursuing a master's degree overseas" });
  await approveSeparation(hr, sep.id);
  await createSeparation(ctxOf("ivy"), { employeeId: ids.ivy, type: "RESIGNATION", noticeDate: D("2026-09-24"), lastWorkingDate: D("2026-10-23"), reason: "Better offer closer to home" });
  console.log("  ✓ separations");

  // ── Performance ──
  const cycle = await launchCycle(hr, { name: "2026 Mid-Year Review", type: "MID_YEAR", startDate: D("2026-07-01"), endDate: D("2026-10-31") });
  const goalSeeds: [string, string, number, number, string][] = [
    ["danial", "Ship payments v2 API", 40, 85, "ON_TRACK"],
    ["danial", "Reduce p95 latency to < 300ms", 30, 60, "AT_RISK"],
    ["danial", "Mentor 1 intern", 30, 100, "DONE"],
    ["wei", "Lead mobile app rewrite", 50, 70, "ON_TRACK"],
    ["wei", "Hire 2 engineers in Penang", 50, 50, "AT_RISK"],
    ["hafiz", "99.95% uptime", 60, 100, "DONE"],
    ["hafiz", "Migrate CI to GitHub Actions", 40, 90, "ON_TRACK"],
    ["priya", "Automate 80% regression suite", 100, 65, "ON_TRACK"],
    ["zul", "RM1.2M new ARR", 70, 72, "ON_TRACK"],
    ["zul", "30 qualified demos / month", 30, 90, "ON_TRACK"],
    ["amir", "Design system v2", 60, 100, "DONE"],
    ["amir", "Onboarding flow redesign", 40, 80, "ON_TRACK"],
  ];
  for (const [key, title, weight, progress, status] of goalSeeds) {
    const g = await setGoal(hr, { employeeId: ids[key], cycleId: cycle.id, title, kind: choice(["KPI", "OKR"]), weight, target: "See brief" });
    await prisma.goal.update({ where: { id: g.id }, data: { progress, status } });
  }
  const reviews = await prisma.performanceReview.findMany({ where: { cycleId: cycle.id } });
  for (const key of ["danial", "hafiz", "wei", "priya", "amir", "zul"]) {
    const r = reviews.find((x) => x.employeeId === ids[key])!;
    await submitSelfReview(ctxOf(key), r.id, choice([3, 4, 4, 5]), "Proud of what I shipped this half. Want to grow into tech lead.");
  }
  for (const key of ["danial", "hafiz", "wei"]) {
    const r = reviews.find((x) => x.employeeId === ids[key])!;
    await submitManagerReview(raj, r.id, { rating: key === "hafiz" ? 5 : 4, comment: "Solid half, great ownership.", strengths: "Ownership, code quality", improvements: "Delegate more" });
  }
  console.log("  ✓ performance");

  // ── Training ──
  const programs = [
    { title: "AWS Solutions Architect Bootcamp", provider: "Amazon Web Services", category: "TECHNICAL", mode: "HYBRID", startDate: D("2026-10-12"), endDate: D("2026-10-14"), hours: 24, costPerPax: 3200, capacity: 8, hrdClaimable: true, hrdClaimStatus: "APPROVED", hrdGrantNo: "HRD-GR-26-0441" },
    { title: "Leading High-Performing Teams", provider: "Leaderonomics", category: "LEADERSHIP", mode: "CLASSROOM", startDate: D("2026-08-05"), endDate: D("2026-08-06"), hours: 16, costPerPax: 2100, capacity: 12, hrdClaimable: true, hrdClaimStatus: "CLAIMED", status: "COMPLETED", hrdGrantNo: "HRD-GR-26-0310" },
    { title: "Anti-Sexual Harassment Awareness", provider: "In-house (People team)", category: "COMPLIANCE", mode: "ONLINE", startDate: D("2026-09-30"), endDate: D("2026-09-30"), hours: 2, costPerPax: 0, capacity: 60, hrdClaimable: false },
    { title: "Forklift Safety Recertification (DOSH)", provider: "NIOSH Malaysia", category: "SAFETY", mode: "CLASSROOM", startDate: D("2026-11-03"), endDate: D("2026-11-04"), hours: 14, costPerPax: 650, capacity: 10, hrdClaimable: true, hrdClaimStatus: "APPLIED" },
    { title: "Negotiation Masterclass", provider: "Asia School of Business", category: "SOFT_SKILLS", mode: "CLASSROOM", startDate: D("2026-07-21"), endDate: D("2026-07-22"), hours: 14, costPerPax: 2800, capacity: 10, hrdClaimable: true, hrdClaimStatus: "CLAIMED", status: "COMPLETED" },
  ];
  const progIds: string[] = [];
  for (const p of programs) progIds.push((await prisma.trainingProgram.create({ data: { tenantId: T, ...p } })).id);
  const enrol = async (pi: number, keys: string[], status = "ENROLLED") => {
    for (const k of keys) await prisma.trainingEnrollment.create({ data: { programId: progIds[pi], employeeId: ids[k], status, score: status === "COMPLETED" ? between(70, 98) : null } });
  };
  await enrol(0, ["hafiz", "wei", "danial", "arjun"]);
  await enrol(1, ["raj", "sarah", "kelvin", "nadia", "melissa", "fadzil"], "COMPLETED");
  await enrol(2, PEOPLE.filter((p) => !p.passport).slice(0, 30).map((p) => p.key));
  await enrol(3, ["razak", "ismail", "rahim", "bishnu"]);
  await enrol(4, ["kelvin", "zul", "joanne", "suresh", "daniel"], "COMPLETED");
  console.log("  ✓ training");

  // ── Benefits ──
  const plans = [
    { name: "Group Hospitalisation & Surgical", type: "GHS", provider: "AIA Malaysia", annualLimit: 80000, premium: 780, coversDependants: true, emoji: "🏥" },
    { name: "Group Term Life", type: "GTL", provider: "Great Eastern", annualLimit: 150000, premium: 180, emoji: "🛡️" },
    { name: "Outpatient GP Panel", type: "OUTPATIENT", provider: "PMCare", annualLimit: 1500, premium: 240, emoji: "🩺" },
    { name: "Dental Care", type: "DENTAL", provider: "PMCare", annualLimit: 500, premium: 60, emoji: "🦷" },
    { name: "Wellness Allowance", type: "WELLNESS", provider: "Lumen Perks", annualLimit: 600, premium: 0, emoji: "🧘" },
  ];
  for (const p of plans) {
    const plan = await prisma.benefitPlan.create({ data: { tenantId: T, ...p } });
    for (const person of PEOPLE) {
      if (p.type === "WELLNESS" && person.company === "LOGI") continue;
      await prisma.benefitEnrollment.create({
        data: { planId: plan.id, employeeId: ids[person.key], dependants: p.coversDependants ? (person.kids?.length ?? 0) + (person.marital === "MARRIED" ? 1 : 0) : 0, utilised: round2(rand() * p.annualLimit * 0.35), startDate: D(person.join) > D("2026-01-01") ? D(person.join) : D("2026-01-01") },
      });
    }
  }
  const clinics = [
    ["Klinik Mediviron Bangsar", "Jalan Telawi, Bangsar", "KUALA_LUMPUR", "GP"],
    ["Qualitas Health Mid Valley", "Mid Valley City", "KUALA_LUMPUR", "GP"],
    ["Pantai Hospital Kuala Lumpur", "Jalan Bukit Pantai", "KUALA_LUMPUR", "HOSPITAL"],
    ["Gleneagles Penang", "Jalan Pangkor, George Town", "PULAU_PINANG", "HOSPITAL"],
    ["Klinik Dr. Lim Bayan Lepas", "Bayan Lepas", "PULAU_PINANG", "GP"],
    ["KPJ Johor Specialist", "Jalan Abdul Samad, JB", "JOHOR", "HOSPITAL"],
    ["Klinik Tebrau 24 Jam", "Taman Tebrau Jaya", "JOHOR", "GP"],
    ["Tooth Fairy Dental Bangsar South", "Bangsar South", "KUALA_LUMPUR", "DENTAL"],
  ];
  for (const [name, address, state, type] of clinics) await prisma.panelClinic.create({ data: { tenantId: T, name, address, state, type, phone: `+60 3-${between(2000, 9999)} ${between(1000, 9999)}` } });
  console.log("  ✓ benefits");

  // ── Assets ──
  const assetSeeds: [string, string, string, number, string?][] = [
    ["MacBook Pro 14\" M4", "LAPTOP", "2025-01-10", 8999, "danial"], ["MacBook Pro 16\" M4 Max", "LAPTOP", "2025-03-01", 14999, "raj"],
    ["MacBook Air 13\" M3", "LAPTOP", "2024-06-15", 5299, "amir"], ["ThinkPad X1 Carbon", "LAPTOP", "2024-02-20", 7200, "meiling"],
    ["ThinkPad T14", "LAPTOP", "2023-09-01", 4800, "zul"], ["MacBook Pro 14\" M4", "LAPTOP", "2025-06-01", 8999, "wei"],
    ["MacBook Pro 14\" M4", "LAPTOP", "2025-06-01", 8999, "hakimi"], ["Dell Latitude 5450", "LAPTOP", "2025-08-01", 4300],
    ["Dell Latitude 5450", "LAPTOP", "2025-08-01", 4300, "ivy"], ["iPhone 16", "PHONE", "2025-02-01", 3999, "kelvin"],
    ["Samsung Galaxy S25", "PHONE", "2025-04-10", 3699, "suresh"], ["LG UltraFine 27\" 4K", "MONITOR", "2024-01-05", 1899, "danial"],
    ["Dell U2723QE", "MONITOR", "2024-01-05", 2199, "hafiz"], ["Dell U2723QE", "MONITOR", "2024-01-05", 2199],
    ["Toyota Hilux (JSK 1234)", "VEHICLE", "2022-05-01", 138000, "ramli"], ["Forklift Toyota 8FBE", "OTHER", "2021-03-15", 68000, "razak"],
    ["Access Card #0041", "ACCESS_CARD", "2025-01-01", 50, "danial"], ["Access Card #0042", "ACCESS_CARD", "2025-01-01", 50],
    ["Herman Miller Aeron", "FURNITURE", "2023-07-01", 6200, "ceo"], ["iPad Pro 11\"", "OTHER", "2025-09-01", 4899, "sarah"],
  ];
  for (const [i, [name, cat, pd, cost, owner]] of assetSeeds.entries()) {
    const a = await prisma.asset.create({ data: { tenantId: T, tag: `LD-${cat.slice(0, 3)}-${String(i + 1).padStart(3, "0")}`, name, category: cat, serialNo: `SN${between(100000, 999999)}`, purchaseDate: D(pd), cost, condition: choice(["NEW", "GOOD", "GOOD", "FAIR"]) } });
    if (owner) await assignAsset(hr, a.id, ids[owner]);
  }
  await prisma.asset.create({ data: { tenantId: T, tag: "LD-LAP-099", name: "MacBook Air 2020", category: "LAPTOP", purchaseDate: D("2020-11-01"), cost: 4299, status: "REPAIR", condition: "POOR", notes: "Battery swollen" } });
  console.log("  ✓ assets");

  // ── Employee relations ──
  const dc = await openCase(hr, { employeeId: ids.arif, category: "ATTENDANCE", severity: "MINOR", incidentDate: D("2026-09-18"), description: "Late more than 30 minutes on 6 occasions in September without notice." });
  await issueShowCause(hr, dc.id, 3);
  await openCase(hr, { employeeId: ids.lee, category: "SAFETY", severity: "MAJOR", incidentDate: D("2026-09-11"), description: "Operated loading bay equipment without PPE; near-miss reported by supervisor." });
  await fileGrievance(ctxOf("siti"), { employeeId: ids.siti, anonymous: false, category: "WORKPLACE", subject: "Aircon in support area not working", description: "Temperature is very high in the afternoon; it affects our focus on calls." });
  await fileGrievance(ctxOf("grace"), { employeeId: null, anonymous: true, category: "MANAGER", subject: "Meeting culture", description: "Too many late-evening meetings scheduled in the product team." });
  console.log("  ✓ ER cases");

  // ── Foreign workforce ──
  const permits: [string, string, string, string, string, string, number, string][] = [
    ["rahim", "PLKS", "PLKS-JB-2023-11872", "MANUFACTURING", "Bangladesh", "2023-02-01", 1850, "2026-10-14"],
    ["bishnu", "PLKS", "PLKS-JB-2023-22019", "MANUFACTURING", "Nepal", "2023-08-14", 1850, "2027-08-13"],
    ["budi", "PLKS", "PLKS-JB-2024-03321", "MANUFACTURING", "Indonesia", "2024-04-01", 1850, "2026-11-30"],
    ["aung", "PLKS", "PLKS-JB-2024-09915", "MANUFACTURING", "Myanmar", "2024-10-01", 1850, "2026-09-20"],
    ["arjun", "EP_I", "EP-KL-2024-00451", "SERVICES", "India", "2024-01-15", 0, "2027-01-14"],
  ];
  for (const [key, type, no, sector, country, issue, levy, expiry] of permits) {
    await upsertPermit(hr, { employeeId: ids[key], permitType: type, permitNo: no, sector, sourceCountry: country, issueDate: D(issue), expiryDate: D(expiry), levyAmount: levy, fomemaDate: type === "PLKS" ? D("2026-02-10") : null, fomemaStatus: type === "PLKS" ? "FIT" : "PENDING", insuranceNo: type === "PLKS" ? `SPIKPA-${between(10000, 99999)}` : null, insuranceExpiry: type === "PLKS" ? D(expiry) : null });
  }
  console.log("  ✓ foreign workforce");

  // ── Engagement ──
  const anns = [
    { title: "Mid-year reviews are open 🎯", body: "Please complete your self-review by 10 Oct. Managers, calibration sessions are on 20 Oct.", emoji: "🎯", pinned: true },
    { title: "Welcome to our new joiners 👋", body: "Say hi to Jason (Penang Eng), Farah (Eng intern) and Yee Wen (Marketing intern)!", emoji: "👋" },
    { title: "Deepavali open house — 6 Nov", body: "Join us at KL HQ from 12pm. Muruku, thosai and good vibes guaranteed.", emoji: "🪔" },
    { title: "New: claim mileage from your phone", body: "Mileage is now auto-calculated at RM0.60/km. Just enter distance and purpose.", emoji: "🚗" },
  ];
  for (const [i, a] of anns.entries()) await prisma.announcement.create({ data: { tenantId: T, authorName: "Aisyah binti Rahman", publishedAt: addDays(today, -i * 4), ...a } });
  const kudosSeeds: [string, string, string, string, string][] = [
    ["raj", "hafiz", "Ownership 🦾", "Hafiz stayed calm and fixed the 2am outage in 12 minutes. Legend.", "🔥"],
    ["sarah", "amir", "Bold Moves 🚀", "The new design system is gorgeous and shipped a week early!", "🎨"],
    ["danial", "priya", "Teamwork 🤝", "Thanks for pairing on the flaky tests all afternoon 🙏", "🙌"],
    ["kelvin", "zul", "Customer Obsessed 💛", "Closed the Iskandar Holdings deal — biggest this quarter!", "🏆"],
    ["melissa", "siti", "Customer Obsessed 💛", "CSAT 98% this month. Customers love you!", "💛"],
    ["aisyah", "shalini", "Kaizen 🔁", "The new onboarding checklist cut setup time in half.", "⚡"],
    ["fadzil", "razak", "Integrity 🧭", "Flagged a safety issue before anyone got hurt. Thank you.", "🦺"],
  ];
  for (const [from, to, value, message, emoji] of kudosSeeds) await giveKudos(ctxOf(from), { toId: ids[to], value, message, emoji });
  const survey = await prisma.survey.create({
    data: {
      tenantId: T,
      title: "Q3 Pulse Check 💓",
      description: "Five quick questions. Fully anonymous.",
      questions: JSON.stringify([
        { id: "q1", text: "How likely are you to recommend Lumen as a place to work?", type: "NPS" },
        { id: "q2", text: "I have the tools I need to do my job well.", type: "SCALE" },
        { id: "q3", text: "My manager gives me useful feedback.", type: "SCALE" },
        { id: "q4", text: "I feel my workload is manageable.", type: "SCALE" },
        { id: "q5", text: "One thing we should start doing?", type: "TEXT" },
      ]),
      closesAt: addDays(today, 10),
    },
  });
  const ideas = ["More WFH days", "Quarterly hackathons", "Better coffee ☕", "Team lunches", "Clearer promotion criteria", "Learning budget", ""];
  for (const p of PEOPLE.slice(0, 26)) {
    if (!users[ids[p.key]]) continue;
    await respondSurvey(ctxOf(p.key), survey.id, { q1: between(5, 10), q2: between(3, 5), q3: between(2, 5), q4: between(2, 5), q5: choice(ideas) });
  }
  console.log("  ✓ engagement");

  // ── Helpdesk ──
  const t1 = await openTicket(ctxOf("danial"), { category: "PAYROLL", subject: "PCB seems higher this month", description: "My PCB went up in August — is it because of the bonus?", priority: "MEDIUM" });
  await commentTicket(hr, t1.id, "Hi Danial! Yes — bonuses are taxed as additional remuneration in the month paid. Your normal PCB is unchanged. 👍", false);
  await prisma.ticket.update({ where: { id: t1.id }, data: { status: "RESOLVED", assignee: "Aisyah binti Rahman" } });
  await openTicket(ctxOf("grace"), { category: "LETTER_REQUEST", subject: "Employment confirmation letter for bank loan", description: "Need a letter stating my salary & position for a housing loan application at Maybank.", priority: "HIGH" });
  await openTicket(ctxOf("jason"), { category: "BENEFITS", subject: "How do I add my parents to medical?", description: "Can parents be added as dependants under the GHS plan?", priority: "LOW" });
  await openTicket(ctxOf("kumar"), { category: "LEAVE", subject: "Replacement leave for Malaysia Day", description: "I worked on 16 Sep — can I get a replacement day instead of OT pay?", priority: "MEDIUM" });
  console.log("  ✓ helpdesk");

  // ── Recruitment ──
  const jobs = [
    { title: "Senior Backend Engineer (Go)", dept: "ENG", location: "Kuala Lumpur", workMode: "HYBRID", salaryMin: 9000, salaryMax: 13000, headcount: 2 },
    { title: "Account Executive — Northern Region", dept: "SAL", location: "Penang", workMode: "ONSITE", salaryMin: 4000, salaryMax: 5500, headcount: 1 },
    { title: "People Operations Executive", dept: "PPL", location: "Kuala Lumpur", workMode: "HYBRID", salaryMin: 3800, salaryMax: 4800, headcount: 1 },
    { title: "Warehouse Supervisor", dept: "OPS", location: "Johor Bahru", workMode: "ONSITE", salaryMin: 3500, salaryMax: 4500, headcount: 1 },
  ];
  const firstNames = ["Aiman", "Chong", "Deepa", "Elaine", "Fikri", "Gan", "Harith", "Iris", "Jun", "Khairul", "Lavanya", "Marcus", "Nisha", "Omar", "Pei Shan", "Qistina", "Rizal", "Swee Lin", "Thiru", "Umairah", "Vincent", "Wan Aina", "Xavier", "Yasmin", "Zikri"];
  const lastNames = ["Tan", "Rahman", "Pillai", "Lim", "Ismail", "Wong", "Kaur", "Abdullah", "Lee", "Hassan"];
  const stages = ["APPLIED", "APPLIED", "SCREENING", "SCREENING", "INTERVIEW", "INTERVIEW", "OFFER", "REJECTED"];
  let n = 0;
  for (const j of jobs) {
    const job = await prisma.jobOpening.create({
      data: { tenantId: T, title: j.title, departmentId: depts[j.dept], location: j.location, workMode: j.workMode, salaryMin: j.salaryMin, salaryMax: j.salaryMax, headcount: j.headcount, description: "We're growing fast and looking for someone who loves ownership and good coffee.", closingDate: addDays(today, 30) },
    });
    for (let k = 0; k < 6; k++) {
      const name = `${firstNames[n % firstNames.length]} ${lastNames[(n * 3) % lastNames.length]}`;
      n++;
      const stage = stages[(n + k) % stages.length];
      const c = await prisma.candidate.create({
        data: {
          tenantId: T, jobId: job.id, name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@gmail.com`, phone: `+60 1${between(0, 9)}-${between(100, 999)} ${between(1000, 9999)}`,
          source: choice(["LINKEDIN", "JOBSTREET", "HIREDLY", "REFERRAL", "CAREERS_PAGE", "MAUKERJA"]), stage, rating: stage === "APPLIED" ? 0 : between(2, 5),
          expectedSalary: round2(between(j.salaryMin, j.salaryMax + 1500) / 100) * 100, currentCompany: choice(["Grab", "Shopee", "AirAsia", "Maybank", "Petronas Digital", "Carsome", "Fave", "Setel", "-"]), noticePeriod: choice(["Immediate", "1 month", "2 months", "3 months"]),
        },
      });
      if (["INTERVIEW", "OFFER"].includes(stage)) {
        await prisma.interview.create({ data: { candidateId: c.id, scheduledAt: addDays(today, between(-7, 7)), mode: choice(["VIDEO", "ONSITE"]), interviewer: choice(["Raj", "Aisyah", "Kelvin", "Fadzil", "Sarah"]), score: stage === "OFFER" ? between(4, 5) : null, recommendation: stage === "OFFER" ? "HIRE" : null } });
      }
    }
  }
  console.log("  ✓ recruitment");

  // ── Documents ──
  const tplOffer = await prisma.letterTemplate.findFirst({ where: { tenantId: T, category: "CONFIRMATION" } });
  if (tplOffer) {
    const { generateLetter } = await import("../src/server/services/culture.service");
    await generateLetter(hr, tplOffer.id, ids.azlan);
  }
  const policies = await prisma.policy.findMany({ where: { tenantId: T } });
  for (const p of PEOPLE.slice(0, 30)) for (const pol of policies.slice(0, 2)) await prisma.policyAcknowledgement.create({ data: { policyId: pol.id, employeeId: ids[p.key] } });

  // ── Billing ──
  for (let m = 1; m <= 9; m++) {
    const seats = 44 + Math.floor(m / 3);
    const amount = seats * 12;
    await prisma.invoice.create({
      data: { tenantId: T, number: `INV-2026-${String(m).padStart(4, "0")}`, period: `2026-${String(m).padStart(2, "0")}`, seats, amount, sst: round2(amount * 0.08), status: m === 9 ? "DUE" : "PAID", issuedAt: D(`2026-${String(m).padStart(2, "0")}-01`) },
    });
  }

  // Company holiday
  await prisma.publicHoliday.create({ data: { tenantId: T, date: D("2026-12-31"), name: "Lumen Year-End Recharge Day 🎉", states: "ALL", kind: "COMPANY", year: 2026 } });

  console.log("✅ Done! Log in with any demo account using password:", PASSWORD);
  console.log(`   HR admin: aisyah@${domain} · Payroll: meiling@${domain} · Manager: raj@${domain} · Employee: danial@${domain} · Owner: ceo@${domain}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
