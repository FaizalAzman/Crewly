# Crewly roadmap: what customers need next

> Written from the product owner's seat, September 2026. Every compliance item names the law it serves.
> Malaysian rules change often (Budget announcements, gazettes, LHDN/KWSP/PERKESO circulars), so confirm each
> threshold and date against the official source before building. The statute references are there to make that check quick.

## How to read this

| Priority | Meaning |
|---|---|
| **P0** | A legal obligation our customers carry today that Crewly doesn't help with, or a gap that could produce a non-compliant payslip, filing or dismissal. Build first. |
| **P1** | High-value features customers ask for in demos and churn over. |
| **P2** | Differentiators and growth. |

Effort: **S** ≤ 1 week, **M** 2–4 weeks, **L** > 1 month (one engineer).

---

## P0: Compliance gaps

### Payroll & wages

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **Wage-payment deadline guard** | EA 1955 s.19 (wages within 7 days after the wage period; OT by the end of the next wage period) | **Shipped:** the workspace pay day and each run's pay date are validated. Next: warn on the dashboard when a run will be paid late, and track OT paid in the following wage period. | S |
| **50% deduction cap** | EA 1955 s.24(8) | The engine already flags payslips whose non-statutory deductions exceed 50% of wages, and approval is now blocked on negative net pay. Next: confirm which deduction categories s.24(8) exempts (e.g. notice indemnity, advance recovery), then block approval on the rest. | S |
| **Hourly / part-time minimum wage** | Minimum Wages Order 2024 (RM1,700/month from 1 Feb 2025, with a later date for employers with fewer than 5 staff); Employment (Part-Time Employees) Regulations 2010 | Hourly/daily rate checks for part-timers and interns, pro-rated part-time leave. The engine checks the monthly figure only. | M |
| **Salary arrears & mid-month changes** | EA 1955 s.2 "wages", s.19 | Backdated increments generate arrears lines, and changes effective mid-month pro-rate. Scheduled future changes now apply automatically (shipped). | M |
| **e-PCB Plus / e-Data PCB export** | Income Tax Act 1967 s.107A; Income Tax (Deduction from Remuneration) Rules 1994 | Produce the current LHDN upload format and keep the CP39 file in step with it. | S |
| **BIK & perquisite exemptions** | ITA 1967 s.13(1)(a)–(b); LHDN Public Rulings on BIK and perquisites | Tag allowances as exempt up to their caps (travel, childcare, phone, etc.) so PCB and Form EA are right. | M |
| **Form E by 31 March** | ITA 1967 s.83 | Generate Form E and C.P.8D from the year's payslips, with an e-Filing checklist. | S |

### Separation & discipline

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **Protected-status dismissal block** | EA 1955 s.41A (pregnant or on maternity leave); Minimum Retirement Age Act 2012 (age 60) | **Shipped:** retrenchment or termination is blocked while maternity leave is booked or in progress (dismissal for misconduct via a concluded disciplinary case is still allowed), and nobody can be retired before 60. Next: a pregnancy flag the employee can declare, so protection starts before maternity leave is booked. | S |
| **Unfair-dismissal readiness** | Industrial Relations Act 1967 s.20 (60-day window); case law on domestic inquiry | For termination-type separations, require the show-cause record, inquiry notes and decision letter before approval, and track the 60-day representation window. | M |
| **Settlement reversal** | Same as above | Withdrawing a separation after the final settlement is posted is now blocked (shipped). Next: a one-click reversal that removes those payroll adjustments and restores loan schedules. | S |
| **CP22A timing** | ITA 1967 s.83 (notify LHDN at least one month before cessation) | Count down to the CP22A deadline from the resignation date, and hold the final payment until LHDN clearance where required. | S |

### Time & leave

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **Flexible Working Arrangement requests** | EA 1955 s.60P–60Q (written application; employer replies in writing within 60 days, with reasons if refused) | Self-service FWA request with a 60-day SLA timer, approve/refuse with mandatory reasons, and a letter template. | S |
| **Hours ceiling** | EA 1955 s.60A (45 h/week; 12 h/day including OT) | Flag rosters and timesheets that break the weekly or daily ceiling, alongside the existing 104-hour OT cap. | S |
| **Public-holiday entitlement check** | EA 1955 s.60D (11 paid holidays, 5 of them fixed: National Day, Agong's birthday, Ruler's/FT Day, Workers' Day, Malaysia Day) | Validate each branch's holiday calendar and warn when fewer than 11 apply or a fixed one is missing. | S |
| **Sabah & Sarawak rules** | Labour Ordinance (Sabah Cap. 67) and (Sarawak Cap. 76), both amended recently | Choose the rule set by branch state, since EA 1955 applies to Peninsular Malaysia and Labuan. Leave, notice and OT rules differ. | L |

### Personal data (PDPA)

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **Data-breach register & 72-hour notification** | PDPA 2010 as amended by the Personal Data Protection (Amendment) Act 2024 (breach notification to the Commissioner, and to affected individuals) | Incident log, severity triage, a countdown timer and pre-filled notification drafts. | M |
| **Data Protection Officer** | PDPA (Amendment) Act 2024 | Record the DPO per workspace, show them on the privacy notice, and route data requests to them. | S |
| **Bilingual privacy notice & consent** | PDPA 2010 s.7 (notice in Bahasa Malaysia *and* English) | Show a BM/EN notice at first login and on the careers page, with versioned acknowledgement. | S |
| **Retention schedules & erasure** | PDPA 2010 s.10 (retention principle); EA 1955 s.61 and Employment Regulations 1957 (keep records at least 6 years) | Per-category retention (e.g. rejected candidates 12 months, payroll 7 years), then anonymise or delete with an audit trail. | M |
| **Per-person data export** | PDPA (Amendment) Act 2024 (data portability); PDPA 2010 s.30–31 (access requests, 21-day response) | Employee-level JSON/PDF export from Me → Profile, and an HR-side access-request workflow with the 21-day response clock. | S |
| **Biometric clock-in consent** | PDPA (Amendment) Act 2024 adds biometric data to sensitive personal data | If we add face or fingerprint kiosks, require explicit consent and keep a non-biometric alternative. | M |
| **2FA for admins & session revocation** | PDPA 2010 s.9 (security principle) | **Session revocation shipped** ("log out of all devices", password change, admin reset, deactivation). Next: TOTP for Owner/HR/Payroll. | M |

### Foreign workforce & workplace safety

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **Passport custody register** | Passports Act 1966 s.12(1)(f); forced-labour indicators under EA 1955 s.90B | Record that each worker holds their own passport, or log written-consent safekeeping with 24/7 access and sign-in/out. | S |
| **Accommodation certificates** | Employees' Minimum Standards of Housing, Accommodations and Amenities Act 1990 (Act 446) | Register employer-provided housing, headcount against capacity, and certificate expiry alerts. | M |
| **Foreign-hire approval** | EA 1955 s.60K | Make approval reference and date mandatory before a foreign employee's first payroll. | S |
| **OSH Coordinator & incidents** | OSHA 1994 as amended in 2022 (OSH coordinator for 5+ employees; right to remove oneself from imminent danger); NADOPOD Regulations 2004 | Appoint the coordinator, log incidents and near-misses, and track the DOSH notification deadline with the report form. | M |

### Crewly as a supplier

| Feature | Law | What it does | Effort |
|---|---|---|---|
| **e-Invoicing for our own billing** | ITA 1967 s.82C; LHDN MyInvois phased rollout (confirm the current turnover thresholds) | Submit Crewly's subscription invoices to MyInvois and store the validated UIN and QR on the invoice PDF. | M |
| **Claims & e-Invoice** | LHDN e-Invoice guideline (employee-incurred expenses) | Accept e-Invoice QR/UIN on receipts and flag claims above the threshold that lack one. | S |

---

## P1: What users ask for

| Feature | Why customers want it | Effort |
|---|---|---|
| **Role-based "getting started" guidance** | **Shipped:** a per-role checklist that ticks itself off from real data (employee: profile & bank, TP1, clock-in, policies; manager: first approval; HR: complete records, logins for everyone; payroll: employer numbers, first run), shown where each person lands; `/help` task guides filtered by role; an invitation email that says what the role can do. Next: short in-page tips on a person's first visit to a page. | S |
| **Bahasa Malaysia UI** | Many SME owners, supervisors and factory staff prefer BM. It's also needed for the PDPA notice. Use `next-intl` with EN/BM, and later 中文 and தமிழ் for payslips. | L |
| **WhatsApp notifications & approvals** | WhatsApp is how Malaysian teams actually communicate. Send leave/claim approvals with one-tap approve links and payslip-ready alerts through the WhatsApp Business API. | M |
| **Installable PWA for Me** | Clock-in, leave, claims and payslips from the home screen, with offline clock-in queued until the connection returns. | M |
| **Bank bulk-payment files** | Maybank2u Biz, CIMB BizChannel, RHB Reflex, Public Bank PBe and DuitNow Bulk formats instead of a generic CSV. | M |
| **Accounting journal export** | Payroll journal to SQL Account, AutoCount and Xero, with cost-centre splits. These are the most common SME ledgers in Malaysia. | M |
| **Direct statutory submission** | KWSP i-Akaun, PERKESO ASSIST and HRD Corp levy files uploaded or pre-validated against each portal's current template, with a monthly "all filed" checklist due by the 15th. | L |
| **E-signature for letters & contracts** | Offer and confirmation letters and contracts signed in-app. Electronic signatures are recognised under the Electronic Commerce Act 2006. EA 1955 s.10 requires a written contract of service. | M |
| **Payroll what-if & bonus planner** | Model increments and bonuses against budget, with PCB on additional remuneration shown before approval. | M |
| **Claims OCR** | Read the merchant, date and amount from receipt photos, detect duplicates across employees, and check against policy limits. | M |
| **Shift swaps & open shifts** | Staff swap shifts with manager approval, subject to the hours ceilings above. | M |
| **Manager mobile inbox** | One screen for all pending approvals with bulk approve, including loans and compensation. | S |

## P2: Differentiators

| Feature | Notes | Effort |
|---|---|---|
| **Gig & contractor workers** | Onboarding, payout and SKSPS contributions (Self-Employment Social Security Act 2017), prepared for the Gig Workers Act 2025 once it commences. | L |
| **Progressive Wage Policy helper** | Check eligibility and track wage progression against the government's Progressive Wage Policy guidelines. | S |
| **HRD Corp grant assistant** | Match training to claimable schemes, track levy balance against claims, and remind before levy funds lapse. | M |
| **People analytics** | Attrition risk, overtime hot spots, pay-equity by gender/race (for internal review only; PDPA purpose limitation applies), and cost-to-company trends. | M |
| **Open API & webhooks** | For enterprise integrations (ERP, SSO provisioning via SCIM, BI). | L |
| **SSO** | Google Workspace and Microsoft Entra ID for staff login. | M |

---

## Platform & engineering (Next.js 16 best practice)

| Item | Why | Effort |
|---|---|---|
| **Adopt Cache Components (`cacheComponents: true`)** | Per-route static shells with `"use cache"` for reference data (holidays, pay items, org units) and Suspense around per-user data, so navigations are instant. The app now streams a skeleton via `loading.tsx` (shipped); this is the next step. Follow `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`. | L |
| **PostgreSQL + `Decimal` money** | SQLite and `Float` are fine for demos, but production payroll needs exact decimals, row locks (`SELECT … FOR UPDATE`) and concurrent writers. | M |
| **Background jobs** | Payroll calculation, bulk emails, scheduled compensation, absentee marking and reminders belong in a queue with cron, not in a request. | M |
| **Object storage for uploads** | S3-compatible storage with signed URLs and antivirus scanning. Uploads now have content sniffing and ownership-based access (shipped). | M |
| **Content-Security-Policy with nonces** | Baseline security headers are now set (shipped). Add a nonce-based CSP via `proxy.ts`. | S |
| **Rate limiting** | Login, password reset, careers applications and checkout. | S |
| **Observability** | `instrumentation.ts` with OpenTelemetry, and error reporting with request IDs matched to `error.tsx` digests. | S |
| **E2E tests** | Playwright journeys for sign-up → first payroll, leave → approval → payslip, and resignation → settlement, plus `instant()` navigation checks. | M |
| **React Compiler** | Enable `reactCompiler: true` once build-time cost is acceptable, and remove manual memoisation. | S |

## Flow gaps from the September 2026 audit

All six gaps listed after the first audit are now closed:

1. **Concurrent payroll recalculation.** A run-level lock (`calculatingSince`, claimed with compare-and-set) stops two calculations from interleaving. A lock older than 10 minutes counts as abandoned.
2. **Payroll inputs changing after calculation.** Adjustments, manual loan repayments and approving or cancelling unpaid leave send the affected calculated run back to draft, so stale figures can't be approved. A manual repayment is refused while an approved, unpaid run already deducts the loan.
3. **Reference numbers** for tickets, grievances, disciplinary cases and invoices come from an atomic per-tenant counter (`Sequence`) instead of `count + 1`.
4. **Plan seat limit** is checked again after insert, and the new row is rolled back if the limit was exceeded.
5. **Session revocation.** Each session carries the user's `sessionVersion`. Changing your password signs out your other devices. An admin password reset, deactivation or "Log out of all devices" signs out every device. A reset link works only once, even when used twice at the same moment.
6. **Performance-review and letter status changes** use `claimTransition`, so an edit that races an "Issue" can't change a letter's issued text.

Still open: two new hires at the same instant can compute the same automatic employee number. The second then fails with a clear "already exists" message and succeeds on retry.
