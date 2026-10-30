import Parser from "rss-parser";
import { toPlainText, safeHttpUrl } from "../sanitize";
import { sha256 } from "../crypto";

export type ParsedItem = {
  guid: string;
  url: string | null;
  title: string;
  excerpt: string;
  author: string | null;
  publishedAt: Date | null;
  sourceUpdatedAt: Date | null;
};

export type ParsedFeed = { title: string | null; items: ParsedItem[]; repaired: boolean };

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

type RawItem = Parser.Item & {
  id?: string;
  updated?: string;
  published?: string;
  author?: string;
  creator?: string;
  summary?: string;
  description?: string;
};

const parser: Parser<Record<string, unknown>, RawItem> = new Parser({
  customFields: { item: ["updated", "published", "id", "summary", "description"] },
  timeout: 1, // we never let rss-parser fetch; parseString only
});

function toDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Common repairs for slightly malformed feeds. Never executes anything. */
export function repairXml(xml: string): string {
  return (
    xml
      // strip BOM and anything before the XML declaration / root
      .replace(/^﻿/, "")
      .replace(/^[\s\S]*?(?=<\?xml|<rss|<feed|<rdf:RDF)/i, "")
      // remove control characters illegal in XML 1.0
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      // escape bare ampersands
      .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
  );
}

function normalise(raw: RawItem): ParsedItem | null {
  const title = toPlainText(raw.title, 500);
  const url = safeHttpUrl(raw.link ?? (typeof raw.guid === "string" && raw.guid.startsWith("http") ? raw.guid : null));
  const excerpt = toPlainText(raw.contentSnippet ?? raw.summary ?? raw.description ?? raw.content, 1200);
  if (!title && !url) return null;
  const publishedAt = toDate(raw.isoDate) ?? toDate(raw.pubDate) ?? toDate(raw.published);
  const updated = toDate(raw.updated);
  const guid =
    (typeof raw.guid === "string" && raw.guid.trim()) ||
    (typeof raw.id === "string" && raw.id.trim()) ||
    url ||
    `hash:${sha256(`${title}|${publishedAt?.toISOString() ?? ""}`)}`;
  return {
    guid: guid.slice(0, 1000),
    url,
    title: title || "(untitled)",
    excerpt,
    author: toPlainText(raw.creator ?? raw.author, 200) || null,
    publishedAt,
    sourceUpdatedAt: updated && publishedAt && updated.getTime() !== publishedAt.getTime() ? updated : updated && !publishedAt ? updated : null,
  };
}

export async function parseFeed(xml: string): Promise<ParsedFeed> {
  if (!xml || !xml.trim()) throw new FeedParseError("Empty response body");
  if (/^\s*<!doctype html|^\s*<html/i.test(xml)) {
    throw new FeedParseError("Response is an HTML page, not a feed (possibly a block page or login wall)");
  }
  let repaired = false;
  let feed: Parser.Output<RawItem>;
  try {
    feed = await parser.parseString(xml);
  } catch (first) {
    try {
      feed = await parser.parseString(repairXml(xml));
      repaired = true;
    } catch {
      throw new FeedParseError(`Malformed feed: ${(first as Error).message.split("\n")[0]}`);
    }
  }
  if (!Array.isArray(feed.items)) throw new FeedParseError("Feed has no items array");
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const raw of feed.items) {
    const n = normalise(raw);
    if (n && !seen.has(n.guid)) {
      seen.add(n.guid);
      items.push(n);
    }
  }
  return { title: feed.title ? toPlainText(feed.title, 200) : null, items, repaired };
}
