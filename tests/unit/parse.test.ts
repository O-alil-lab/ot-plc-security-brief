import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFeed, FeedParseError } from "@/lib/ingest/parse";

const fx = (n: string) => readFileSync(`tests/fixtures/feeds/${n}`, "utf8");

describe("feed parsing", () => {
  it("parses RSS 2.0", async () => {
    const f = await parseFeed(fx("rss-basic.xml"));
    expect(f.items).toHaveLength(2);
    expect(f.items[0]).toMatchObject({ guid: "ICSA-26-300-01", url: "https://www.cisa.gov/news-events/ics-advisories/icsa-26-300-01" });
    expect(f.items[0].publishedAt?.toISOString()).toBe("2026-10-27T12:00:00.000Z");
  });

  it("parses Atom including updated dates", async () => {
    const f = await parseFeed(fx("atom-basic.xml"));
    expect(f.items).toHaveLength(1);
    expect(f.items[0].guid).toBe("urn:ssa:SSA-111111");
    expect(f.items[0].sourceUpdatedAt?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("handles a missing date (null, not 'now')", async () => {
    const f = await parseFeed(fx("rss-basic.xml"));
    expect(f.items[1].publishedAt).toBeNull();
  });

  it("strips HTML from titles and excerpts", async () => {
    const f = await parseFeed(fx("rss-html.xml"));
    expect(f.items[0].title).toBe("Siemens SIMATIC alert");
    expect(f.items[0].excerpt).not.toMatch(/<script|onerror|<img/i);
    expect(f.items[0].url).toBeNull(); // javascript: link rejected
  });

  it("repairs common malformations (bare ampersands)", async () => {
    const f = await parseFeed(fx("rss-malformed-amp.xml"));
    expect(f.repaired).toBe(true);
    expect(f.items[0].title).toBe("Rockwell & Allen-Bradley advisory");
  });

  it("throws a clear error for broken XML", async () => {
    await expect(parseFeed(fx("broken.xml"))).rejects.toBeInstanceOf(FeedParseError);
  });

  it("detects HTML block pages", async () => {
    await expect(parseFeed("<!DOCTYPE html><html><body>Access denied</body></html>")).rejects.toThrow(/HTML page/);
  });

  it("rejects an empty body", async () => {
    await expect(parseFeed("   ")).rejects.toThrow(/Empty/);
  });
});
