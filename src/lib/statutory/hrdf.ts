/**
 * HRD Corp levy — Pembangunan Sumber Manusia Berhad Act 2001.
 *  - Employers with 10 or more Malaysian employees: 1% of monthly wages (mandatory)
 *  - Employers with 5 – 9 Malaysian employees: 0.5% (optional registration)
 * Levy applies to Malaysian citizens' wages only (basic + fixed allowances).
 */
export function hrdfRate(malaysianHeadcount: number, optedIn = false): number {
  if (malaysianHeadcount >= 10) return 0.01;
  if (malaysianHeadcount >= 5 && optedIn) return 0.005;
  return 0;
}

export function calcHrdf(wages: number, rate: number): number {
  return Math.round(wages * rate * 100) / 100;
}
