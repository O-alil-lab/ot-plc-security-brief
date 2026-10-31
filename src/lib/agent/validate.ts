import type { StorySuggestion } from "../ai/provider";
import { extractIds } from "../ingest/normalize";

/**
 * Guardrails for automatically published text. Anything the source text does
 * not support is removed; if the core text itself makes unsupported claims,
 * the whole AI draft is rejected and the agent falls back to the publisher's
 * own wording.
 */
export type ValidationResult = { ok: true; story: StorySuggestion; dropped: string[] } | { ok: false; reason: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** True if `phrase` appears in the source text (case/punctuation-insensitive). */
export function mentionedIn(sourceText: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length > 0 && ` ${norm(sourceText)} `.includes(` ${p} `);
}

const SPECULATION = /\b(actively exploited|exploited in the wild|zero[- ]day|nation[- ]state|ransomware gang|attackers are)\b/i;

export function validateSuggestion(s: StorySuggestion, sourceText: string): ValidationResult {
  const dropped: string[] = [];
  const sourceIds = new Set(extractIds(sourceText));

  if (s.summary.length < 40) return { ok: false, reason: "summary too short" };
  if (!s.headline || s.headline.length < 10) return { ok: false, reason: "headline missing" };

  // 1. No identifiers that the sources don't contain, anywhere in the text.
  for (const field of ["headline", "summary", "whyItMatters", "defensiveGuidance", "guidanceSource"] as const) {
    const unknownIds = extractIds(s[field]).filter((id) => !sourceIds.has(id));
    if (unknownIds.length) return { ok: false, reason: `${field} mentions ${unknownIds.join(", ")}, which the source does not` };
  }

  // 2. No exploitation / attribution claims the source doesn't make.
  for (const field of ["headline", "summary", "whyItMatters"] as const) {
    const m = SPECULATION.exec(s[field]);
    if (m && !mentionedIn(sourceText, m[0])) return { ok: false, reason: `${field} claims "${m[0]}", which the source does not` };
  }

  // 3. Vendors / products must appear in the source text; drop the rest.
  const keep = (list: string[], label: string) =>
    list.filter((v) => {
      const ok = mentionedIn(sourceText, v);
      if (!ok) dropped.push(`${label} "${v}"`);
      return ok;
    });
  const vendors = keep(s.vendors, "vendor");
  const products = keep(s.products, "product");

  // 4. Guidance only with an attribution.
  let defensiveGuidance = s.defensiveGuidance;
  let guidanceSource = s.guidanceSource;
  if (defensiveGuidance && !guidanceSource) {
    dropped.push("unattributed guidance");
    defensiveGuidance = "";
  }
  if (!defensiveGuidance) guidanceSource = "";

  const categories = s.categories.filter((c) => ["vendor-advisories", "ics-advisories", "advisories", "ot-research", "ot-news"].includes(c));

  return { ok: true, dropped, story: { ...s, vendors, products, defensiveGuidance, guidanceSource, categories } };
}
