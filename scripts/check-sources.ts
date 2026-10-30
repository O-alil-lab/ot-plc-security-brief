/**
 * Live check of every seed feed (does not write to the database).
 *   npm run sources:check
 * Prints a Markdown table you can paste into SOURCE_REGISTRY.md.
 */
import { SEED_SOURCES, STRUCTURED_SOURCES } from "../config/sources";
import { safeFetch, FetchError } from "../src/lib/ingest/fetcher";
import { parseFeed } from "../src/lib/ingest/parse";

async function check(url: string, json = false): Promise<string> {
  try {
    const res = await safeFetch(url, { retries: 0, maxBytes: json ? 30 * 1024 * 1024 : undefined });
    if (json) {
      const data = JSON.parse(res.body);
      const n = Array.isArray(data.vulnerabilities) ? data.vulnerabilities.length : Array.isArray(data.feed?.entry) ? data.feed.entry.length : Object.keys(data).length;
      return `ok (${n} records)`;
    }
    const feed = await parseFeed(res.body);
    return `ok (${feed.items.length} items${feed.repaired ? ", repaired" : ""})`;
  } catch (e) {
    if (e instanceof FetchError) return e.kind === "http_error" && e.httpStatus ? `http_${e.httpStatus}` : e.kind;
    return `parse_error: ${(e as Error).message.slice(0, 80)}`;
  }
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  console.log(`| # | Source | Result | Tested |\n|---|---|---|---|`);
  let i = 1;
  for (const s of SEED_SOURCES) console.log(`| ${i++} | ${s.name} | ${await check(s.url)} | ${date} |`);
  console.log(`| S1 | CISA KEV (JSON) | ${await check(STRUCTURED_SOURCES.cisaKev, true)} | ${date} |`);
  console.log(`| S2 | Siemens CSAF (JSON) | ${await check(STRUCTURED_SOURCES.siemensCsaf, true)} | ${date} |`);
}
main();
