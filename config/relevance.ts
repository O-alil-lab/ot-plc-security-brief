import type { TrustLevel } from "@prisma/client";

/**
 * Relevance configuration. Relevance is an editorial triage aid only.
 * It is NOT severity and NOT evidence of exploitation.
 */
export const RELEVANCE_TERMS: string[] = [
  "PLC",
  "OT security",
  "operational technology",
  "ICS",
  "industrial control",
  "SCADA",
  "HMI",
  "DCS",
  "RTU",
  "critical infrastructure",
  "industrial ransomware",
  "industrial cybersecurity",
  "industrial vulnerability",
  "Modbus",
  "DNP3",
  "OPC UA",
  "EtherNet/IP",
  "PROFINET",
  "IEC 62443",
  "safety instrumented",
  "water utility",
  "power grid",
];

export const RELEVANCE_VENDORS: string[] = [
  "Siemens",
  "SIMATIC",
  "Schneider Electric",
  "Modicon",
  "Rockwell",
  "Allen-Bradley",
  "CODESYS",
  "ABB",
  "Mitsubishi Electric",
  "Honeywell",
  "Emerson",
  "Phoenix Contact",
  "Moxa",
  "Hitachi Energy",
  "GE Vernova",
  "Yokogawa",
  "Omron",
  "WAGO",
];

/** Words that suggest operational impact (signal only). */
export const IMPACT_TERMS: string[] = [
  "remote code execution",
  "denial of service",
  "authentication bypass",
  "actively exploited",
  "ransomware",
  "safety",
  "outage",
  "disrupt",
];

export const WEIGHTS = {
  termMatch: 8, // per distinct term, capped
  termCap: 32,
  vendorMatch: 10, // per distinct vendor, capped
  vendorCap: 20,
  impactMatch: 4,
  impactCap: 8,
  hasIdentifier: 10,
  trust: {
    primary_vendor: 15,
    government_cert: 15,
    research: 8,
    news: 3,
    social: 0,
    community: 0,
  } satisfies Record<TrustLevel, number>,
  recency: [
    { maxAgeDays: 2, points: 15 },
    { maxAgeDays: 7, points: 10 },
    { maxAgeDays: 30, points: 4 },
  ],
};

/** Headline similarity threshold (0..1) for suggesting duplicates. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;
