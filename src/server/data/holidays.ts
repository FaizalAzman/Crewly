/**
 * Gazetted public holidays. Islamic dates are subject to moon sighting (JAKIM) and may shift ±1 day.
 * states: "ALL" or a comma list of state codes.
 */
export interface HolidaySeed {
  date: string;
  name: string;
  states: string;
  kind: "FEDERAL" | "STATE";
}

const EXCEPT_KDH_KTN_TRG = "JOHOR,MELAKA,NEGERI_SEMBILAN,PAHANG,PULAU_PINANG,PERAK,PERLIS,SABAH,SARAWAK,SELANGOR,KUALA_LUMPUR,LABUAN,PUTRAJAYA";
const NEW_YEAR_STATES = "MELAKA,NEGERI_SEMBILAN,PAHANG,PULAU_PINANG,PERAK,SABAH,SARAWAK,SELANGOR,KUALA_LUMPUR,LABUAN,PUTRAJAYA";

export const HOLIDAYS_2026: HolidaySeed[] = [
  { date: "2026-01-01", name: "New Year's Day", states: NEW_YEAR_STATES, kind: "STATE" },
  { date: "2026-02-01", name: "Thaipusam", states: "JOHOR,KEDAH,NEGERI_SEMBILAN,PAHANG,PULAU_PINANG,PERAK,SELANGOR,KUALA_LUMPUR,PUTRAJAYA", kind: "STATE" },
  { date: "2026-02-01", name: "Federal Territory Day", states: "KUALA_LUMPUR,LABUAN,PUTRAJAYA", kind: "STATE" },
  { date: "2026-02-17", name: "Chinese New Year", states: "ALL", kind: "FEDERAL" },
  { date: "2026-02-18", name: "Chinese New Year (Day 2)", states: "ALL", kind: "FEDERAL" },
  { date: "2026-03-07", name: "Nuzul Al-Quran", states: "KELANTAN,PAHANG,PULAU_PINANG,PERAK,PERLIS,SELANGOR,TERENGGANU,KUALA_LUMPUR,LABUAN,PUTRAJAYA", kind: "STATE" },
  { date: "2026-03-20", name: "Hari Raya Aidilfitri (Additional Holiday)", states: "ALL", kind: "FEDERAL" },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri", states: "ALL", kind: "FEDERAL" },
  { date: "2026-03-22", name: "Hari Raya Aidilfitri (Day 2)", states: "ALL", kind: "FEDERAL" },
  { date: "2026-03-23", name: "Hari Raya Aidilfitri (Replacement)", states: EXCEPT_KDH_KTN_TRG, kind: "FEDERAL" },
  { date: "2026-05-01", name: "Labour Day", states: "ALL", kind: "FEDERAL" },
  { date: "2026-05-27", name: "Hari Raya Haji", states: "ALL", kind: "FEDERAL" },
  { date: "2026-05-31", name: "Wesak Day", states: "ALL", kind: "FEDERAL" },
  { date: "2026-06-01", name: "Birthday of SPB Yang di-Pertuan Agong", states: "ALL", kind: "FEDERAL" },
  { date: "2026-06-17", name: "Awal Muharram", states: "ALL", kind: "FEDERAL" },
  { date: "2026-08-25", name: "Prophet Muhammad's Birthday", states: "ALL", kind: "FEDERAL" },
  { date: "2026-08-31", name: "National Day", states: "ALL", kind: "FEDERAL" },
  { date: "2026-09-16", name: "Malaysia Day", states: "ALL", kind: "FEDERAL" },
  { date: "2026-11-08", name: "Deepavali", states: "ALL,-SARAWAK", kind: "FEDERAL" },
  { date: "2026-12-25", name: "Christmas Day", states: "ALL", kind: "FEDERAL" },
  // State-specific
  { date: "2026-03-23", name: "Birthday of the Sultan of Johor", states: "JOHOR", kind: "STATE" },
  { date: "2026-06-21", name: "Birthday of the Sultan of Kedah", states: "KEDAH", kind: "STATE" },
  { date: "2026-09-29", name: "Birthday of the Sultan of Kelantan", states: "KELANTAN", kind: "STATE" },
  { date: "2026-04-15", name: "Melaka Historical City Day", states: "MELAKA", kind: "STATE" },
  { date: "2026-01-14", name: "Birthday of the Yang di-Pertuan Besar NS", states: "NEGERI_SEMBILAN", kind: "STATE" },
  { date: "2026-07-30", name: "Birthday of the Sultan of Pahang", states: "PAHANG", kind: "STATE" },
  { date: "2026-07-07", name: "George Town World Heritage Day", states: "PULAU_PINANG", kind: "STATE" },
  { date: "2026-11-06", name: "Birthday of the Sultan of Perak", states: "PERAK", kind: "STATE" },
  { date: "2026-05-17", name: "Birthday of the Raja of Perlis", states: "PERLIS", kind: "STATE" },
  { date: "2026-05-30", name: "Pesta Kaamatan", states: "SABAH,LABUAN", kind: "STATE" },
  { date: "2026-05-31", name: "Pesta Kaamatan (Day 2)", states: "SABAH,LABUAN", kind: "STATE" },
  { date: "2026-06-01", name: "Gawai Dayak", states: "SARAWAK", kind: "STATE" },
  { date: "2026-06-02", name: "Gawai Dayak (Day 2)", states: "SARAWAK", kind: "STATE" },
  { date: "2026-12-11", name: "Birthday of the Sultan of Selangor", states: "SELANGOR", kind: "STATE" },
  { date: "2026-03-04", name: "Anniversary of Installation of Sultan of Terengganu", states: "TERENGGANU", kind: "STATE" },
  { date: "2026-12-24", name: "Christmas Eve", states: "SABAH", kind: "STATE" },
];

export const HOLIDAYS_2025: HolidaySeed[] = [
  { date: "2025-01-01", name: "New Year's Day", states: NEW_YEAR_STATES, kind: "STATE" },
  { date: "2025-01-29", name: "Chinese New Year", states: "ALL", kind: "FEDERAL" },
  { date: "2025-01-30", name: "Chinese New Year (Day 2)", states: "ALL", kind: "FEDERAL" },
  { date: "2025-02-01", name: "Federal Territory Day", states: "KUALA_LUMPUR,LABUAN,PUTRAJAYA", kind: "STATE" },
  { date: "2025-02-11", name: "Thaipusam", states: "JOHOR,KEDAH,NEGERI_SEMBILAN,PAHANG,PULAU_PINANG,PERAK,SELANGOR,KUALA_LUMPUR,PUTRAJAYA", kind: "STATE" },
  { date: "2025-03-31", name: "Hari Raya Aidilfitri", states: "ALL", kind: "FEDERAL" },
  { date: "2025-04-01", name: "Hari Raya Aidilfitri (Day 2)", states: "ALL", kind: "FEDERAL" },
  { date: "2025-05-01", name: "Labour Day", states: "ALL", kind: "FEDERAL" },
  { date: "2025-05-12", name: "Wesak Day", states: "ALL", kind: "FEDERAL" },
  { date: "2025-06-02", name: "Birthday of SPB Yang di-Pertuan Agong", states: "ALL", kind: "FEDERAL" },
  { date: "2025-06-07", name: "Hari Raya Haji", states: "ALL", kind: "FEDERAL" },
  { date: "2025-06-27", name: "Awal Muharram", states: "ALL", kind: "FEDERAL" },
  { date: "2025-08-31", name: "National Day", states: "ALL", kind: "FEDERAL" },
  { date: "2025-09-01", name: "National Day (Replacement)", states: "ALL", kind: "FEDERAL" },
  { date: "2025-09-05", name: "Prophet Muhammad's Birthday", states: "ALL", kind: "FEDERAL" },
  { date: "2025-09-16", name: "Malaysia Day", states: "ALL", kind: "FEDERAL" },
  { date: "2025-10-20", name: "Deepavali", states: "ALL,-SARAWAK", kind: "FEDERAL" },
  { date: "2025-12-25", name: "Christmas Day", states: "ALL", kind: "FEDERAL" },
];

