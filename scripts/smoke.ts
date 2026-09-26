/**
 * Smoke test: signs a session for a demo user and requests every app route, reporting
 * non-200 responses and pages that rendered an error. Usage:
 *   npx tsx scripts/smoke.ts [email] [baseUrl]
 */
import { prisma } from "../src/lib/db";
import { SESSION_COOKIE, signSession } from "../src/lib/auth/session-token";
import { BRAND } from "../src/lib/brand";

const email = process.argv[2] ?? `aisyah@${BRAND.demoDomain}`;
const base = process.argv[3] ?? "http://localhost:3000";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role, sv: user.sessionVersion });
  const emp = await prisma.employee.findFirst({ where: { tenantId: user.tenantId }, orderBy: { employeeNo: "asc" } });
  const run = await prisma.payrollRun.findFirst({ where: { tenantId: user.tenantId }, orderBy: { period: "desc" }, include: { payslips: { take: 1 } } });
  const job = await prisma.jobOpening.findFirst({ where: { tenantId: user.tenantId } });
  const ticket = await prisma.ticket.findFirst({ where: { tenantId: user.tenantId } });
  const cycle = await prisma.reviewCycle.findFirst({ where: { tenantId: user.tenantId } });
  const tenantSlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })).slug;
  const letter = await prisma.generatedLetter.findFirst({ where: { tenantId: user.tenantId } });

  const routes = (process.env.ROUTES?.split(",") ?? [
    "/dashboard", "/me", "/help", "/me/profile", "/me/leave", "/me/time", "/me/claims", "/me/payslips", "/me/tax", "/me/documents", "/approvals", "/directory",
    "/employees/import", "/onboarding?tab=templates", "/settings?tab=roles", "/documents?tab=letters&status=DRAFT", `/careers/${tenantSlug}`, `/careers/${tenantSlug}/${job?.id}`,
    "/api/export/employee-template",
    "/employees", "/employees/new", `/employees/${emp?.id}`, `/employees/${emp?.id}/edit`,
    ...["job", "pay", "family", "documents", "leave", "payslips", "history", "assets"].map((t) => `/employees/${emp?.id}?tab=${t}`),
    "/org", "/org?tab=branches", "/org?tab=departments", "/org?tab=positions", "/org?tab=grades", "/org?tab=chart",
    "/recruitment", `/recruitment/${job?.id}`, "/onboarding", "/offboarding",
    "/leave", "/leave?tab=balances", "/leave?tab=calendar", "/leave?tab=types", "/holidays",
    "/attendance", "/attendance?tab=timesheet", "/shifts", "/overtime",
    "/payroll", `/payroll/${run?.id}`, `/payroll/${run?.id}/payslip/${run?.payslips[0]?.id}`, "/pay-items", "/statutory", "/tax", "/tax?tab=ea", "/tax?tab=calculator",
    "/claims", "/loans", "/compensation", "/benefits",
    "/performance", `/performance/${cycle?.id}`, "/training",
    "/disciplinary", "/grievances", "/foreign-workers", "/documents", "/assets",
    "/engagement", "/engagement?tab=kudos", "/engagement?tab=surveys", "/helpdesk", `/helpdesk/${ticket?.id}`,
    "/reports", "/settings", "/settings?tab=users", "/settings?tab=audit", "/settings?tab=billing",
    `/api/export/employees`, `/api/export/epf?runId=${run?.id}`, `/documents/letters/${letter?.id}`,
  ]).filter((r) => !r.includes("undefined"));

  let failures = 0;
  for (const r of routes) {
    const t0 = Date.now();
    const res = await fetch(base + r, { headers: { cookie: `${SESSION_COOKIE}=${token}` }, redirect: "manual" });
    const body = await res.text();
    const bad = res.status >= 400 || /Application error|Unhandled Runtime Error|id="__next_error__"/.test(body);
    if (bad) failures++;
    const loc = res.headers.get("location");
    console.log(`${bad ? "✗" : "✓"} ${res.status} ${String(Date.now() - t0).padStart(5)}ms ${r}${loc ? ` → ${loc}` : ""}`);
    if (bad) {
      const m = body.match(/"message":"([^"]{0,300})/) ?? body.match(/<title>([^<]*)/);
      if (m) console.log(`    ${m[1]}`);
    }
  }
  console.log(failures ? `\n${failures} route(s) failed` : "\nAll routes OK");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main();
