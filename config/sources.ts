import type { SourceType, TrustLevel } from "@prisma/client";

export type SeedSource = {
  name: string;
  url: string;
  type: SourceType;
  trustLevel: TrustLevel;
  category: string;
  pollIntervalMinutes?: number;
};

/**
 * Real seed feeds. URLs can change or block automated access; check
 * SOURCE_REGISTRY.md for the last observed status. Never guess replacements.
 */
export const SEED_SOURCES: SeedSource[] = [
  { name: "CISA ICS Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml", type: "rss", trustLevel: "government_cert", category: "ics-advisories" },
  { name: "CISA ICS Medical Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/ics-medical-advisories.xml", type: "rss", trustLevel: "government_cert", category: "ics-advisories" },
  { name: "CISA Alerts", url: "https://www.cisa.gov/cybersecurity-advisories/alerts.xml", type: "rss", trustLevel: "government_cert", category: "advisories" },
  { name: "CISA Cybersecurity Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml", type: "rss", trustLevel: "government_cert", category: "advisories" },
  { name: "CERT/CC Vulnerability Notes", url: "https://www.kb.cert.org/vuls/atomfeed/", type: "atom", trustLevel: "government_cert", category: "advisories" },
  { name: "Siemens ProductCERT Advisories", url: "https://cert-portal.siemens.com/productcert/rss/advisories.atom", type: "atom", trustLevel: "primary_vendor", category: "vendor-advisories" },
  { name: "Siemens ProductCERT Alerts & News", url: "https://cert-portal.siemens.com/productcert/rss/alerts.atom", type: "atom", trustLevel: "primary_vendor", category: "vendor-advisories" },
  { name: "Palo Alto Networks Advisories", url: "https://security.paloaltonetworks.com/rss.xml", type: "rss", trustLevel: "primary_vendor", category: "vendor-advisories" },
  { name: "Fortinet PSIRT", url: "https://filestore.fortinet.com/fortiguard/rss/ir.xml", type: "rss", trustLevel: "primary_vendor", category: "vendor-advisories" },
  // CERT@VDE is the coordinating CERT for many German/European OT vendors
  // (Phoenix Contact, WAGO, CODESYS, Beckhoff, Pepperl+Fuchs, Bachmann, ...).
  { name: "CERT@VDE Advisories (Phoenix Contact, WAGO, CODESYS, Beckhoff, ...)", url: "https://certvde.com/en/advisories/feeds/rss/", type: "rss", trustLevel: "government_cert", category: "vendor-advisories" },
  { name: "Moxa Security Advisories", url: "https://www.moxa.com/en/rss/moxa-security-advisory", type: "rss", trustLevel: "primary_vendor", category: "vendor-advisories" },
  { name: "Mitsubishi Electric PSIRT", url: "https://www.mitsubishielectric.com/psirt/vulnerability/xml/info.xml", type: "rss", trustLevel: "primary_vendor", category: "vendor-advisories" },
  { name: "Nozomi Networks Security Alerts", url: "https://security.nozominetworks.com/rss.xml", type: "rss", trustLevel: "research", category: "ot-research" },
  { name: "Kaspersky ICS CERT", url: "https://ics-cert.kaspersky.com/feed/", type: "rss", trustLevel: "research", category: "ot-research" },
  { name: "Waterfall Security", url: "https://waterfall-security.com/feed/", type: "rss", trustLevel: "research", category: "ot-research" },
  { name: "Industrial Cyber", url: "https://industrialcyber.co/feed/", type: "rss", trustLevel: "news", category: "ot-news" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/", type: "rss", trustLevel: "news", category: "security-news" },
  { name: "The Record", url: "https://therecord.media/feed", type: "rss", trustLevel: "news", category: "security-news" },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", type: "rss", trustLevel: "news", category: "security-news" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", type: "rss", trustLevel: "news", category: "security-news" },
];

export const STRUCTURED_SOURCES = {
  cisaKev: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  siemensCsaf: "https://cert-portal.siemens.com/productcert/csaf/ssa-feed-tlp-white.json",
};

export const PRIMARY_TRUST_LEVELS: TrustLevel[] = ["primary_vendor", "government_cert"];
