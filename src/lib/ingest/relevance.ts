import type { TrustLevel } from "@prisma/client";
import { RELEVANCE_TERMS, RELEVANCE_VENDORS, IMPACT_TERMS, WEIGHTS } from "../../../config/relevance";

export type RelevanceBreakdown = {
  terms: string[];
  vendors: string[];
  impact: string[];
  identifiers: string[];
  trustLevel: TrustLevel;
  ageDays: number | null;
  points: { terms: number; vendors: number; impact: number; identifiers: number; trust: number; recency: number };
  total: number;
  note: string;
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function matchAll(text: string, list: string[]): string[] {
  const hits: string[] = [];
  for (const term of list) {
    // Short all-caps acronyms (PLC, ICS, HMI) must match case-sensitively as whole words.
    const caseSensitive = term.length <= 4 && term === term.toUpperCase();
    const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(term)}([^A-Za-z0-9]|$)`, caseSensitive ? "" : "i");
    if (re.test(text)) hits.push(term);
  }
  return hits;
}

/**
 * Deterministic, explainable triage score (0–100).
 * NOT a severity rating and NOT evidence of exploitation.
 */
export function scoreRelevance(input: {
  title: string;
  excerpt?: string | null;
  identifiers: string[];
  trustLevel: TrustLevel;
  publishedAt?: Date | null;
  now?: Date;
}): RelevanceBreakdown {
  const text = `${input.title}\n${input.excerpt ?? ""}`;
  const terms = matchAll(text, RELEVANCE_TERMS);
  const vendors = matchAll(text, RELEVANCE_VENDORS);
  const impact = matchAll(text, IMPACT_TERMS);
  const now = input.now ?? new Date();
  const ageDays = input.publishedAt ? Math.max(0, (now.getTime() - input.publishedAt.getTime()) / 86_400_000) : null;

  const points = {
    terms: Math.min(terms.length * WEIGHTS.termMatch, WEIGHTS.termCap),
    vendors: Math.min(vendors.length * WEIGHTS.vendorMatch, WEIGHTS.vendorCap),
    impact: Math.min(impact.length * WEIGHTS.impactMatch, WEIGHTS.impactCap),
    identifiers: input.identifiers.length ? WEIGHTS.hasIdentifier : 0,
    trust: WEIGHTS.trust[input.trustLevel] ?? 0,
    recency: ageDays === null ? 0 : (WEIGHTS.recency.find((r) => ageDays <= r.maxAgeDays)?.points ?? 0),
  };
  // Generic IT items with no industrial term or vendor are capped low so they
  // don't crowd the inbox just because a trusted source published them.
  const industrial = terms.length + vendors.length > 0;
  let total = Object.values(points).reduce((a, b) => a + b, 0);
  if (!industrial) total = Math.min(total, 15);
  total = Math.max(0, Math.min(100, total));

  return {
    terms,
    vendors,
    impact,
    identifiers: input.identifiers,
    trustLevel: input.trustLevel,
    ageDays: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    points,
    total,
    note: "Relevance is a triage aid, not severity or exploitation status.",
  };
}
