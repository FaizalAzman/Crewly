export const STATES = [
  { code: "JOHOR", name: "Johor" },
  { code: "KEDAH", name: "Kedah" },
  { code: "KELANTAN", name: "Kelantan" },
  { code: "MELAKA", name: "Melaka" },
  { code: "NEGERI_SEMBILAN", name: "Negeri Sembilan" },
  { code: "PAHANG", name: "Pahang" },
  { code: "PULAU_PINANG", name: "Pulau Pinang" },
  { code: "PERAK", name: "Perak" },
  { code: "PERLIS", name: "Perlis" },
  { code: "SABAH", name: "Sabah" },
  { code: "SARAWAK", name: "Sarawak" },
  { code: "SELANGOR", name: "Selangor" },
  { code: "TERENGGANU", name: "Terengganu" },
  { code: "KUALA_LUMPUR", name: "W.P. Kuala Lumpur" },
  { code: "LABUAN", name: "W.P. Labuan" },
  { code: "PUTRAJAYA", name: "W.P. Putrajaya" },
] as const;

export type StateCode = (typeof STATES)[number]["code"];

export const stateName = (code?: string | null) => STATES.find((s) => s.code === code)?.name ?? code ?? "-";

/** NRIC place-of-birth codes (digits 7-8) → state. */
export const NRIC_STATE_CODES: Record<string, StateCode> = {
  "01": "JOHOR", "21": "JOHOR", "22": "JOHOR", "23": "JOHOR", "24": "JOHOR",
  "02": "KEDAH", "25": "KEDAH", "26": "KEDAH", "27": "KEDAH",
  "03": "KELANTAN", "28": "KELANTAN", "29": "KELANTAN",
  "04": "MELAKA", "30": "MELAKA",
  "05": "NEGERI_SEMBILAN", "31": "NEGERI_SEMBILAN", "59": "NEGERI_SEMBILAN",
  "06": "PAHANG", "32": "PAHANG", "33": "PAHANG",
  "07": "PULAU_PINANG", "34": "PULAU_PINANG", "35": "PULAU_PINANG",
  "08": "PERAK", "36": "PERAK", "37": "PERAK", "38": "PERAK", "39": "PERAK",
  "09": "PERLIS", "40": "PERLIS",
  "10": "SELANGOR", "41": "SELANGOR", "42": "SELANGOR", "43": "SELANGOR", "44": "SELANGOR",
  "11": "TERENGGANU", "45": "TERENGGANU", "46": "TERENGGANU",
  "12": "SABAH", "47": "SABAH", "48": "SABAH", "49": "SABAH",
  "13": "SARAWAK", "50": "SARAWAK", "51": "SARAWAK", "52": "SARAWAK", "53": "SARAWAK",
  "14": "KUALA_LUMPUR", "54": "KUALA_LUMPUR", "55": "KUALA_LUMPUR", "56": "KUALA_LUMPUR", "57": "KUALA_LUMPUR",
  "15": "LABUAN", "58": "LABUAN",
  "16": "PUTRAJAYA",
};

export const ROLES = ["OWNER", "HR_ADMIN", "PAYROLL", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  HR_ADMIN: "HR Admin",
  PAYROLL: "Payroll Officer",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

export const RACES = ["MALAY", "CHINESE", "INDIAN", "BUMIPUTERA_SABAH", "BUMIPUTERA_SARAWAK", "OTHERS"] as const;
export const RELIGIONS = ["ISLAM", "BUDDHISM", "CHRISTIANITY", "HINDUISM", "TAOISM", "SIKHISM", "OTHERS", "NONE"] as const;
export const MARITAL = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;
export const CITIZENSHIP = ["CITIZEN", "PR", "FOREIGNER"] as const;
export const EMPLOYMENT_TYPES = ["PERMANENT", "CONTRACT", "PROBATION", "INTERN", "PART_TIME"] as const;
export const EMPLOYEE_STATUS = ["ACTIVE", "PROBATION", "NOTICE", "RESIGNED", "TERMINATED", "RETIRED"] as const;
export const ACTIVE_STATUSES = ["ACTIVE", "PROBATION", "NOTICE"];

export const BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Islam",
  "Bank Rakyat", "OCBC Bank", "UOB Malaysia", "HSBC Malaysia", "Standard Chartered", "Affin Bank",
  "Alliance Bank", "BSN", "Agrobank", "Bank Muamalat", "MBSB Bank", "GXBank", "AEON Bank", "Boost Bank",
];

export const COMPANY_VALUES = ["Customer Obsessed 💛", "Ownership 🦾", "Kaizen 🔁", "Teamwork 🤝", "Bold Moves 🚀", "Integrity 🧭"];

export const humanize = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
