# Crewly: HR, payroll & compliance for Malaysian teams

Crewly is a multi-tenant HR SaaS built for the Malaysian market. It covers the whole employee lifecycle, from recruitment through payroll to separation. The statutory rules for EPF, SOCSO, EIS, PCB, HRD Corp and the Employment Act 1955 are encoded in the engine and covered by automated tests.

> The admin screens are designed for desktop. On phones, the **Me** page (clock-in, leave, claims, payslips) works well, and a notice tells mobile users this.

## Quick start

```bash
npm install
npx prisma db push        # creates prisma/dev.db (SQLite)
npm run db:seed           # demo company "Lumen Digital Sdn Bhd"
npm run pdf:browser       # one-off: the Chromium build that prints PDFs to match the screen
npm run dev               # http://localhost:3000
```

After pulling changes that touch `prisma/schema.prisma`, run `npx prisma db push` to update your database. `npm install`, `npm run build` and `npm run typecheck` regenerate the Prisma client automatically, so the code never compiles against stale types.

To open it from a phone on the same Wi-Fi, use `http://<your-LAN-IP>:3000`. `next.config.ts` allows LAN origins in development.

### Demo accounts (password `demo1234`)

| Role | Email |
|---|---|
| Owner | ceo@lumendigital.my |
| HR Admin | aisyah@lumendigital.my |
| Payroll | meiling@lumendigital.my |
| Manager | raj@lumendigital.my |
| Employee | danial@lumendigital.my |
| Custom role "Recruiter" | azlan@lumendigital.my |
| **Crewly operator** (platform console at `/platform`) | admin@crewly.my |

Other customer workspaces, so the operator console and billing states have realistic data:

| Workspace | Owner login | State |
|---|---|---|
| Kopi Kaki Café | owner@kopikaki.my | Starter trial, 9 days left |
| Borneo Timber Works | james@borneotimber.my | Trial ended, so read-only until they pay |
| Nusantara Clinics | farhana@nusantaraclinics.my | Paying, Growth yearly |
| Petaling Printing | ahchai@petalingprint.my | Suspended, so login is refused |

The seed creates 44 employees across two legal entities and three branches (KL, Penang, JB), including foreign workers. It also runs nine months of payroll (Jan–Sep 2026) through the real engine, with Sep awaiting approval, and adds leave, attendance, claims, OT, loans, reviews, training, ER cases, permits, surveys and tickets.

## Modules (32)

| Area | Modules |
|---|---|
| Home | Dashboard, Me (self-service), Approvals inbox |
| People | Employees (full employee records), Organization (entities, branches, departments, positions, grades, org chart), Recruitment (kanban ATS), Onboarding, Offboarding & separation |
| Time | Leave (EA 1955), Public holidays (by state), Attendance (GPS geofence), Shifts & roster, Overtime |
| Money | Payroll runs, Pay items, EPF/SOCSO/EIS/HRD Corp, Tax (PCB, TP1/TP3, Form EA, CP8D, CP22/22A), Claims, Loans & advances, Compensation, Benefits |
| Talent | Performance (KPIs/OKRs, reviews, calibration), Training & HRD Corp levy |
| Compliance | Disciplinary (show-cause and domestic inquiry), Grievances & sexual harassment, Foreign workforce (PLKS/EP, FOMEMA, levy), Letters & policies, Assets |
| Culture | Announcements, kudos, pulse surveys (eNPS), HR helpdesk |
| Admin | Reports & analytics, Settings (workspace policy, users & roles, audit log, PDPA, billing) |

## SaaS: how customers get on Crewly

1. **Sign up** (`/signup`) creates a workspace: company, owner login, Malaysian defaults (leave types, pay items, claim types, letter templates, policies, grades, holidays) and a **14-day free trial**. A welcome email is sent.
2. **Guided setup** (`/welcome` and a dashboard card) tracks six steps: statutory numbers, departments and branches, the owner's own profile, employees (one by one or CSV import), inviting the HR team, and the first payroll. Progress comes from the real data, so it can't drift.
3. **Invites** email a set-password link (7 days). **Forgot password** emails a 1-hour, single-use link. Only a sha256 hash of each token is stored, and requests are throttled.
4. **Billing** (`Settings → Billing`): plans are Starter RM6 (up to 25 employees), Growth RM12 and Enterprise RM18 (multiple legal entities), per employee per month, with a minimum of 10 seats. Yearly billing gives 2 months free. SST is 8%. Checkout charges through a `PaymentGateway` adapter, records a paid invoice, emails a receipt, and the invoice downloads as a PDF. Plan limits are enforced when adding employees or switching plans.
5. **Access follows the subscription.** Trials and active subscriptions have full access. An ended trial, an unpaid subscription or a lapsed cancellation becomes **read-only**: people can still log in, view data and pay. Suspended or closed workspaces can't log in. Cancelling keeps access until the paid period ends.
6. **Owner data rights:** export the whole workspace as JSON (audited), or close it by typing its name. Support can restore it within 30 days.
7. **Operator console** (`/platform`, for users with `platformAdmin`): MRR, paying customers, trials, at-risk accounts and sign-ups, plus per-workspace detail. Operators can extend trials, suspend or reactivate workspaces, and comp a plan, and every action goes into the customer's audit log. It also has an email outbox.

**Before going live**, swap in real providers at these two points:
- `gateway()` in `src/server/services/subscription.service.ts` currently uses a sandbox gateway. FPX and cards succeed; card `4000 0000 0000 0002` declines. Implement `PaymentGateway` for Billplz, Stripe or iPay88, and add a webhook for recurring renewals.
- `sendMail()` in `src/server/services/mail.service.ts` writes to an outbox table, which you can view at `/platform/emails`. Set `MAIL_PROVIDER` and send via SES, Postmark or Resend. Set `APP_URL` for links in emails.

## Documents & PDFs

- Letters, payslips, Form EA and invoices download as **PDFs that look exactly like the document on screen**: the same React component, CSS and fonts. `/api/pdf/{letter|payslip|ea|invoice}/<id>` checks access, then headless Chromium prints the chrome-free page `/print/<kind>/<id>` to A4. Text stays real and selectable. Add `?inline=1` to open the PDF in the browser.
- Install the browser once per machine with `npm run pdf:browser`. It pins the Chromium build that matches `playwright-core`; the generic `npx playwright install` fetches a different build, which won't be found. Chromium is found at `CHROMIUM_PATH`, then `$PLAYWRIGHT_BROWSERS_PATH/chromium`, then Playwright's default location. It loads the print page from this server only (`PDF_RENDER_ORIGIN`, default `http://127.0.0.1:$PORT`) and may not contact any other host. `PDF_RENDER_CONCURRENCY` (default 3) caps parallel renders. Without Chromium, or with `PDF_RENDERER=pdfkit`, the older pdfkit layout is used instead, so downloads keep working.
- The **letterhead** is set once per legal entity in `Documents → Letterhead`: logo, colour, layout, contact line, footer, signatory and signature image. It is applied at render time, so changing it updates every letter.
- Letter bodies use the Source Serif 4 web font (not the device's serif), so a letter looks the same on every screen and in its PDF.
- Letters go through **Draft → Issued → Acknowledged**. A letter can't be issued while it still has unfilled placeholders such as `[describe matter]`. Employees see issued letters under **Me → Documents** and acknowledge them there.

## Roles

There are five built-in roles: Owner, HR Admin, Payroll, Manager and Employee. You can add **custom roles** in `Settings → Roles` with any set of permissions and either company-wide or team scope. People below Owner can't grant permissions they don't hold themselves, and a workspace always keeps at least one owner.

The full product plan is in [`docs/PLAN.md`](docs/PLAN.md). What to build next, with the Malaysian law behind each item, is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Statutory coverage

| Rule | Where |
|---|---|
| EPF Third Schedule: 11% / 13% / 12%, age 60+ (0/4, PR 5.5/6.5), non-citizen 2% / 2% (Oct 2025), RM20/RM100 bands | `src/lib/statutory/epf.ts` |
| SOCSO Cat 1 / Cat 2 / foreign EI, EIS 0.2%, RM6,000 ceiling, 5-sen table rounding | `src/lib/statutory/socso.ts` |
| PCB/MTD computerised method (2026 spec), categories 1–3, reliefs, EPF RM4,000 cap, SOCSO/EIS RM350, TP1, TP3, bonus (additional remuneration), zakat, < RM10 rule, non-resident 30% | `src/lib/statutory/pcb.ts` |
| EA 1955 (2022 amendments): annual 8/12/16, sick 14/18/22, hospitalisation 60, maternity 98, paternity 7 (s.60FA), notice 4/6/8 weeks, termination benefits 10/15/20 days, OT 1.5×/2×/3× (s.60A), 104 h OT cap, suspension ≤ 14 days, minimum wage RM1,700 | `src/lib/statutory/employment-act.ts` |
| HRD Corp levy 1% (≥ 10 Malaysians) / 0.5% opt-in | `src/lib/statutory/hrdf.ts` |
| 2025–2026 federal and state public holidays | `src/server/data/holidays.ts` |

The submission files (KWSP, PERKESO, LHDN CP39, bank) follow the published column layouts. Check them against each portal's current template before filing for real.

## Architecture

```
src/
  lib/                 pure logic (no DB): statutory engines, payroll engine, calendar, NRIC, analytics
  server/
    services/          business rules — framework-free, take a Ctx {tenantId, userId, role, permissions, scope, employeeId}
    guard.ts           permissions, approval chain, audit log, notifications
    context.ts         Next.js glue: session cookie → Ctx
    action.ts          wraps server actions (domain errors → form messages)
  app/
    (auth)/            login, sign-up (creates a workspace)
    (app)/<module>/    pages (server components) + thin server actions calling services
    api/export/        CSV exports (employees, KWSP, PERKESO, CP39, bank, CP8D) + workspace JSON
    api/pdf/           true PDFs (letters, payslips, EA, invoices) — src/server/pdf
    api/files/         uploaded files (stored under /storage, access-checked)
    platform/          Crewly operator console
  components/          neo-brutalist UI kit, forms/modals, charts
prisma/schema.prisma   ~60 models, multi-tenant (tenantId on every row)
```

- **Stack:** Next.js 16 (App Router, Server Components, Server Actions, Route Handlers), TypeScript, Tailwind v4, Prisma 6 and SQLite (switch the `provider` to PostgreSQL for production), jose JWT sessions, bcrypt, zod, recharts.
- **Integrity:** every "on behalf of" action checks that the target employee is in the tenant and, for team-scoped roles, in the actor's reporting line (`assertActOnEmployee`). Approvals, payroll payment, settlements and compensation use compare-and-set transitions (`claimTransition`), so a double click or two approvers can't apply money side effects twice.
- **Speed:** `src/proxy.ts` redirects signed-out visitors before rendering, `loading.tsx` streams a skeleton on every navigation, per-request data is memoised with React `cache`, and every tenant and foreign-key filter is indexed.
- **Security:** role-based permissions (`src/lib/permissions.ts`), manager-chain approvals, no self-approval, maker-checker on payroll, tenant scoping in every service, audit log (including personal-data exports), HttpOnly session cookies, masked NRIC for non-privileged roles.
- **Branding** lives in one file: `src/lib/brand.ts`.

## Testing

Two **separate** Vitest projects:

| Suite | Command | What it covers |
|---|---|---|
| **Unit** (`tests/unit`) | `npm run test:unit` | Pure functions with no database: EPF / SOCSO / EIS / PCB tables and edge cases, Employment Act rules, HRD levy, the payroll engine (proration, unpaid leave, bonus, OT, claims, loans, zakat, TP1), statutory file formats, NRIC parsing, the working-day calendar, analytics and domain helpers |
| **Business rules** (`tests/business`) | `npm run test:business` | End-to-end rules through the real services against a throwaway SQLite database (`prisma/test.db`, recreated each run, one isolated tenant per spec): employees, leave entitlement and approvals, payroll workflow and calculations, claims and loan limits, attendance and OT, separation settlement, recruitment and performance, disciplinary due process, harassment complaints, permits, engagement, sign-up and auth, tenant isolation, roles and billing |

`npm test` runs both. `TEST_DB_NAME=other.db` points the business suite at a different throwaway file, so two runs can happen at once.

`scripts/smoke.ts` renders every page as a given user: `npx tsx scripts/smoke.ts aisyah@lumendigital.my`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` / `db:seed` / `db:reset` | Schema, demo data, full reset of the dev DB |
| `npm test` / `test:unit` / `test:business` / `test:watch` | Tests |

## Known limitations

- Money is stored as `Float` rounded to 2 dp for SQLite. On PostgreSQL, switch to `Decimal`.
- Islamic holiday dates depend on moon sighting; the holiday table is editable in-app.
- Uploads (receipts, MCs, CVs, logos) are stored on local disk under `/storage` (max 5 MB; PDF, images, Word). Point `UPLOAD_DIR` to a mounted volume, or swap in S3, for production.
- Payments and email go through sandbox/outbox adapters until a real provider is configured (see **SaaS** above).
- Browsers only share GPS over HTTPS, so on plain-HTTP LAN access clock-ins are accepted but flagged "no location".
