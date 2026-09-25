import { NRIC_STATE_CODES, type StateCode } from "./constants";

export interface NricInfo {
  valid: boolean;
  normalized: string;
  dateOfBirth: Date | null;
  gender: "MALE" | "FEMALE" | null;
  birthState: StateCode | null;
  bornOverseas: boolean;
}

/**
 * Parse a Malaysian MyKad number (YYMMDD-PB-###G).
 *  - YYMMDD: date of birth
 *  - PB: place of birth (state code, or 60–99 for foreign-born)
 *  - G: last digit — odd = male, even = female
 */
export function parseNric(input: string, today: Date = new Date()): NricInfo {
  const digits = (input ?? "").replace(/\D/g, "");
  const empty: NricInfo = { valid: false, normalized: input, dateOfBirth: null, gender: null, birthState: null, bornOverseas: false };
  if (digits.length !== 12) return empty;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const pb = digits.slice(6, 8);
  const last = Number(digits[11]);

  // Century: assume 20xx if that isn't in the future, else 19xx.
  const currentYY = today.getUTCFullYear() % 100;
  const year = yy <= currentYY ? 2000 + yy : 1900 + yy;
  const dob = new Date(Date.UTC(year, mm - 1, dd));
  if (mm < 1 || mm > 12 || dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) return empty;

  const pbNum = Number(pb);
  const birthState = NRIC_STATE_CODES[pb] ?? null;
  return {
    valid: pbNum !== 0 && (birthState !== null || pbNum >= 60),
    normalized: `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`,
    dateOfBirth: dob,
    gender: last % 2 === 1 ? "MALE" : "FEMALE",
    birthState,
    bornOverseas: pbNum >= 60 && !birthState,
  };
}

export function maskNric(nric?: string | null) {
  if (!nric) return "-";
  const d = nric.replace(/\D/g, "");
  if (d.length !== 12) return nric.replace(/.(?=.{4})/g, "•");
  return `${d.slice(0, 6)}-••-••${d.slice(10)}`;
}
