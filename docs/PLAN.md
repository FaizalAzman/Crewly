# Crewly — Product & Module Plan

> The people platform your whole crew will actually like. A multi-tenant SaaS HRMS built for the Malaysian market.

## 1. Product positioning

| | |
|---|---|
| Market | Malaysian SMEs → corporates (multi-entity groups, 20–5,000 staff) |
| Model | SaaS, multi-tenant (one workspace per customer, many legal entities per workspace) |
| Vibe | Startup-style, playful neo-brutalist UI (cream paper, ink borders, offset shadows, bright accents) with clear, professional copy |
| Stack | Next.js 16 (App Router, Server Components, Server Actions, Route Handlers) · TypeScript · Tailwind v4 · Prisma 6 · SQLite (dev; swap to PostgreSQL via `DATABASE_URL`) · jose (JWT sessions) · bcryptjs · zod · recharts · lucide icons |

## 2. Roles

| Role | Can do |
|---|---|
| OWNER | Everything incl. billing & deleting workspace |
| HR_ADMIN | All HR modules, settings, users |
| PAYROLL | Payroll, statutory, tax, claims payment, loans |
| MANAGER | Team view, approvals (leave/claims/OT), reviews for direct reports |
| EMPLOYEE | Self-service only ("Me" portal) |

## 3. Modules (32)

### A. Core & Organization
1. **Dashboard** – role-aware: headcount, who's on leave today, birthdays & work anniversaries, pending approvals, payroll countdown, permit expiries, statutory due dates (EPF/SOCSO/EIS/PCB by 15th).
2. **Organization** – legal entities (SSM reg no, EPF employer no, SOCSO employer code, LHDN E-number, HRD Corp no), branches (with state → drives public holidays & geofence), departments (tree, cost centre, head), positions, job grades (salary bands), interactive org chart.
3. **Employees (201 file)** – full profile: NRIC/passport, DOB (auto from NRIC), gender, race, religion, nationality/citizenship, marital, spouse working/disabled, children (for tax relief), address/state, emergency contacts, bank, EPF/SOCSO/tax numbers, tax resident flag, employment type, probation/confirmation, salary, job history timeline, documents with expiry. Bulk CSV import/export.
4. **Recruitment (ATS)** – job openings, kanban pipeline (Applied → Screening → Interview → Offer → Hired/Rejected), candidate profiles, interview scheduling & scorecards, one-click "convert to employee".
5. **Onboarding** – checklist templates, auto-generated tasks on hire (e.g. "Register KWSP", "Register PERKESO", "CP22 to LHDN within 30 days", laptop, buddy), progress tracking.
6. **Offboarding & Separation** – resignation / termination / retirement / end-of-contract; EA 1955 s.12 notice-period calculator, termination & lay-off benefit calculator (10/15/20 days per year), leave encashment, clearance checklist, CP22A/CP21 reminders, exit interview.

### B. Time & Leave
7. **Leave Management** – EA 1955 (2022 amendment) entitlements by service years (annual 8/12/16, sick 14/18/22, hospitalisation 60, maternity 98, paternity 7), plus replacement, unpaid, compassionate, marriage, hajj, exam leave; half days; carry-forward & expiry; proration for joiners; working-day calculation that skips rest days & state public holidays; team calendar; balances.
8. **Holidays & Work Calendar** – federal + state public holidays (16 states/FTs), per-branch state mapping, custom company holidays, replacement holiday rule.
9. **Attendance** – web clock in/out with GPS geofence, late/early detection with grace period, daily/monthly timesheets, manual adjustments, absence detection.
10. **Shifts & Rostering** – shift definitions (incl. overnight), weekly roster grid, rest-day allocation.
11. **Overtime** – OT requests & approval; EA s.60A pay rates (1.5× normal day, 2× rest day, 3× public holiday), rest-day/PH work pay, 104-hour monthly cap warning, ORP = monthly ÷ 26, flows into payroll.

### C. Pay & Compliance
12. **Payroll** – monthly runs per legal entity: draft → calculate → review → approve → paid → lock; proration for joiners/leavers; unpaid-leave deduction; OT; claims reimbursement; loan repayment; one-off adjustments & bonus (additional remuneration); payslips (printable); bank payment file (CSV).
13. **Pay Items** – earnings/deductions catalogue with statutory flags (EPF/SOCSO/EIS/PCB/HRDF applicability), recurring per-employee allowances.
14. **Statutory Contributions** – engines for:
   - **EPF (KWSP)** Third Schedule: 11% employee; 13% employer (≤ RM5,000) / 12% (> RM5,000); age 60+: 0% / 4%; non-citizens: 2% / 2% (from Oct 2025); RM20/RM100 band rounding up to RM20,000 then exact %.
   - **SOCSO (PERKESO)** Category 1 (EI + Invalidity: ER 1.75% / EE 0.5%), Category 2 (EI only, 60+: ER 1.25%), foreign workers EI only; wage ceiling RM6,000; band tables.
   - **EIS (SIP)** 0.2% / 0.2%, ceiling RM6,000, age 18–60, citizens & PRs only.
   - **HRD Corp levy** 1% (≥ 10 Malaysian staff) / 0.5% (5–9).
   - **Zakat** via payroll (offsets PCB).
   - Monthly contribution reports & e-submission CSVs (KWSP Borang A format, PERKESO Borang 8A / SIP, LHDN CP39 text).
15. **Income Tax (LHDN)** – PCB/MTD computerised-calculation method (2026 spec), categories 1/2/3, reliefs (individual, spouse, children, disabled, EPF RM4,000 cap), TP1 additional reliefs, TP3 prior-employer YTD, additional remuneration (bonus) PCB, 5-sen rounding, < RM10 rule; **Form EA** (annual), **Form E** summary, **CP8D**, **CP22** (new hire), **CP22A** (leaver), **CP39**.
16. **Claims & Expenses** – claim types with monthly/annual limits, receipts, mileage (per-km rate), approval, reimbursement through payroll (taxable vs non-taxable).
17. **Loans & Advances** – salary advances & staff loans, instalment schedules auto-deducted in payroll.
18. **Compensation** – salary bands per grade, increments/promotions (with history), bonus planning, compa-ratio.
19. **Benefits & Insurance** – GHS/GTL/medical/dental/optical plans, enrolment with dependants, utilisation tracking, panel clinics.

### D. Talent
20. **Performance** – review cycles (annual, mid-year, probation), KPIs/OKRs with weights & progress, self + manager review, 5-point rating, calibration view.
21. **Training & HRD Corp** – training programmes, enrolment, completion & certificates, HRD Corp claimable flag & grant tracking vs levy balance.

### E. Employee Relations & Compliance
22. **Disciplinary** – case management per Industrial Relations practice: report → show-cause letter → reply → domestic inquiry → decision (warning, final warning, suspension ≤ 2 weeks per EA s.14, dismissal).
23. **Grievances & Harassment** – confidential grievance channel incl. sexual-harassment complaints (EA s.81A–81H), inquiry tracking, anonymous option.
24. **Foreign Workforce** – PLKS / VP(TE) / Employment Pass tracking, passport & permit expiry, levy, FOMEMA medical, SPIKPA insurance, source country, alerts.
25. **Documents & Letters** – letter templates with merge fields (offer, confirmation, increment, warning, experience letter), generation & print, company policies with e-acknowledgement.

### F. Engagement & Service
26. **Engagement** – announcements, kudos wall (with company values), pulse surveys (eNPS).
27. **Helpdesk** – HR tickets with categories, priority, SLA, comments.
28. **Approvals Inbox** – one place for every pending leave, claim, OT and loan; bulk approve.
29. **Employee Self-Service ("Me")** – profile, payslips, EA form, leave, claims, attendance, documents, TP1 relief declaration.

### G. Platform
30. **Reports & Analytics** – headcount, turnover/attrition, diversity (race/gender/age), payroll cost trend, statutory cost, leave utilisation, attendance/lateness, CSV export.
31. **Settings & Security** – users & roles, workspace settings (work week, payroll cut-off, OT rules), audit log, PDPA 2010 data-access log & consent.
32. **Billing (SaaS)** – plans (Starter / Growth / Enterprise), per-seat pricing in RM, invoices, trial.

Plus: marketing landing page, sign-up wizard that creates a workspace, demo data.

## 4. Build order
1. Scaffold, design system, auth, multi-tenancy, app shell.
2. Schema + seed ("Lumen Digital Sdn Bhd" demo, ~45 staff).
3. Statutory engines (EPF/SOCSO/EIS/PCB/HRDF/EA 1955) + unit checks.
4. Org + Employees.
5. Leave, holidays, attendance, shifts, OT.
6. Payroll, pay items, statutory reports, tax forms, claims, loans.
7. Talent, ER, foreign workers, documents.
8. Engagement, helpdesk, approvals, self-service.
9. Reports, settings, billing, landing page.

## 5. Notes / assumptions
- Money is stored as Float rounded to 2 dp for SQLite simplicity; use Decimal on PostgreSQL in production.
- Islamic holidays are subject to moon sighting; the holiday table is editable.
- Statutory e-submission files follow the published column layouts but should be validated against the portals before real use.
