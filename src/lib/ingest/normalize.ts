import { sha256 } from "../crypto";

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|_hsenc|_hsmi|mkt_tok)$/i;

/** Normalise a URL for duplicate detection. Returns null for non-http(s). */
export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.protocol = "https:";
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.port === "443" || u.port === "80") u.port = "";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  u.pathname = path;
  return u.toString();
}

const ID_PATTERNS: RegExp[] = [
  /\bCVE-\d{4}-\d{4,7}\b/gi,
  /\bICSA-\d{2}-\d{3}-\d{2}\b/gi,
  /\bICSMA-\d{2}-\d{3}-\d{2}\b/gi,
  /\bSSA-\d{6}\b/gi,
  /\bSSB-\d{6}\b/gi,
  /\bVU#\d{5,7}\b/gi,
  /\bFG-IR-\d{2}-\d{3,4}\b/gi,
  /\bPAN-SA-\d{4}-\d{4}\b/gi,
  /\bAA\d{2}-\d{3}[A-Z]?\b/g,
  /\bVDE-\d{4}-\d{3,5}\b/gi,
  /\bMPSA-\d{4,7}\b/gi,
];

/** Extract CVE and advisory identifiers. These are signals, not proof of identity. */
export function extractIds(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  const joined = texts.filter(Boolean).join(" \n ");
  for (const re of ID_PATTERNS) {
    for (const m of joined.matchAll(re)) found.add(m[0].toUpperCase());
  }
  return [...found].sort();
}

const STOPWORDS = new Set(
  "a an the of in on for to and or with by from at as is are be vs via new update updated multiple vulnerabilities vulnerability security advisory".split(" "),
);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9#\- ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Jaccard similarity of significant words in two headlines (0..1). */
export function headlineSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function contentHash(title: string, excerpt: string | null | undefined, updated?: Date | null): string {
  return sha256(`${title.trim()}\n${(excerpt ?? "").trim()}\n${updated?.toISOString() ?? ""}`);
}
