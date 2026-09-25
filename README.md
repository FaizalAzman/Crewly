# Crewly: HR, payroll & compliance for Malaysian teams

Crewly is a multi-tenant HR SaaS built for the Malaysian market. It covers the whole employee lifecycle, from recruitment through payroll to separation. The statutory rules for EPF, SOCSO, EIS, PCB, HRD Corp and the Employment Act 1955 are encoded in the engine and covered by automated tests.

> The admin screens are designed for desktop. On phones, the **Me** page (clock-in, leave, claims, payslips) works well, and a notice tells mobile users this.

## Quick start

```bash
npm install
npx prisma db push        # creates prisma/dev.db (SQLite)
npm run db:seed           # demo company "Lumen Digital Sdn Bhd"
npm run dev               # http://localhost:3000
```

To open it from a phone on the same Wi-Fi, use `http://<your-LAN-IP>:3000`. `next.config.ts` allows LAN origins in development.

### Demo accounts (password `demo1234`)

| Role | Email |
|---|---|
| Owner | ceo@lumendigital.my |
| HR Admin | aisyah@lumendigital.my |
| Payroll | meiling@lumendigital.my |
| Manager | raj@lumendigital.my |
| Employee | danial@lumendigital.my |

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

The full product plan is in [`docs/PLAN.md`](docs/PLAN.md).

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
    services/          business rules — framework-free, take a Ctx {tenantId, userId, role, employeeId}
    guard.ts           permissions, approval chain, audit log, notifications
    context.ts         Next.js glue: session cookie → Ctx
    action.ts          wraps server actions (domain errors → form messages)
  app/
    (auth)/            login, sign-up (creates a workspace)
    (app)/<module>/    pages (server components) + thin server actions calling services
    api/export/        CSV exports (employees, KWSP, PERKESO, CP39, bank, CP8D)
  components/          neo-brutalist UI kit, forms/modals, charts
prisma/schema.prisma   ~60 models, multi-tenant (tenantId on every row)
```

- **Stack:** Next.js 16 (App Router, Server Components, Server Actions, Route Handlers), TypeScript, Tailwind v4, Prisma 6 and SQLite (switch the `provider` to PostgreSQL for production), jose JWT sessions, bcrypt, zod, recharts.
- **Security:** role-based permissions (`src/lib/permissions.ts`), manager-chain approvals, no self-approval, maker-checker on payroll, tenant scoping in every service, audit log (including personal-data exports), HttpOnly session cookies, masked NRIC for non-privileged roles.
- **Branding** lives in one file: `src/lib/brand.ts`.

## Testing

Two **separate** Vitest projects:

| Suite | Command | What it covers |
|---|---|---|
| **Unit** (`tests/unit`) | `npm run test:unit` | Pure functions with no database: EPF / SOCSO / EIS / PCB tables and edge cases, Employment Act rules, HRD levy, the payroll engine (proration, unpaid leave, bonus, OT, claims, loans, zakat, TP1), statutory file formats, NRIC parsing, the working-day calendar, analytics and domain helpers |
| **Business rules** (`tests/business`) | `npm run test:business` | End-to-end rules through the real services against a throwaway SQLite database (`prisma/test.db`, recreated each run, one isolated tenant per spec): employees, leave entitlement and approvals, payroll workflow and calculations, claims and loan limits, attendance and OT, separation settlement, recruitment and performance, disciplinary due process, harassment complaints, permits, engagement, sign-up and auth, tenant isolation, roles and billing |

`npm test` runs both. Current status: **464 tests** (263 unit + 201 business), all passing.

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
- File uploads (receipts, documents) are stored as references or links. Connect S3 or similar storage for binaries.
- Browsers only share GPS over HTTPS, so on plain-HTTP LAN access clock-ins are accepted but flagged "no location".
