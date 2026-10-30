import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource, upsertItems, nextDueAt } from "@/lib/ingest/ingest";
import { resetDb, makeSource, rssXml } from "../helpers";

const routes: Record<string, { status: number; body: string }> = {};
let server: Server;
let host = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const r = routes[req.url ?? ""] ?? { status: 404, body: "" };
    res.writeHead(r.status, { "content-type": "application/rss+xml" });
    res.end(r.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(resetDb);

const fetchOptions = () => ({ unsafeAllowHostsForTests: [host], retries: 0, proxyUrl: "" });
const recent = new Date(Date.now() - 86_400_000).toUTCString();

describe("ingestion", () => {
  it("stores new items in the inbox and never publishes them", async () => {
    routes["/a"] = { status: 200, body: rssXml([{ title: "Siemens SIMATIC PLC flaw CVE-2026-1000", link: "https://x.example/a", guid: "a1", pubDate: recent }]) };
    const s = await makeSource({ url: `http://${host}/a` });
    const r = await runSource(s.id, { fetchOptions: fetchOptions() });
    expect(r).toMatchObject({ status: "ok", itemsNew: 1 });
    const item = await prisma.collectedItem.findFirstOrThrow();
    expect(item.inboxStatus).toBe("new");
    expect(item.extractedIds).toEqual(["CVE-2026-1000"]);
    expect(await prisma.story.count()).toBe(0);
  });

  it("records a 403 as a failure, not as zero new items", async () => {
    routes["/forbidden"] = { status: 403, body: "no" };
    const s = await makeSource({ url: `http://${host}/forbidden` });
    const r = await runSource(s.id, { fetchOptions: fetchOptions() });
    expect(r.status).toBe("blocked");
    expect(r.httpStatus).toBe(403);
    const src = await prisma.source.findUniqueOrThrow({ where: { id: s.id } });
    expect(src.lastStatus).toBe("blocked");
    expect(src.lastError).toMatch(/403/);
    expect(src.consecutiveFailures).toBe(1);
    expect(src.lastSuccessAt).toBeNull();
    const run = await prisma.fetchRun.findFirstOrThrow({ where: { sourceId: s.id } });
    expect(run.status).not.toBe("ok");
  });

  it("records malformed feeds as parse errors", async () => {
    routes["/bad"] = { status: 200, body: "<rss><channel><item><title>oops" };
    const s = await makeSource({ url: `http://${host}/bad` });
    expect((await runSource(s.id, { fetchOptions: fetchOptions() })).status).toBe("parse_error");
  });

  it("backs off after failures", () => {
    const base = { lastAttemptAt: new Date("2026-01-01T00:00:00Z"), pollIntervalMinutes: 60 };
    expect(nextDueAt({ ...base, consecutiveFailures: 0 }).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(nextDueAt({ ...base, consecutiveFailures: 2 }).toISOString()).toBe("2026-01-01T04:00:00.000Z");
    expect(nextDueAt({ ...base, consecutiveFailures: 20 }).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("deduplicates by GUID and records updates as revisions", async () => {
    const s = await makeSource();
    const item = { guid: "g1", url: "https://x.example/1", title: "Original title", excerpt: "v1", author: null, publishedAt: new Date(), sourceUpdatedAt: null };
    await upsertItems(s, [item]);
    expect(await upsertItems(s, [item])).toEqual({ itemsNew: 0, itemsUpdated: 0 });
    expect(await upsertItems(s, [{ ...item, title: "Updated title", excerpt: "v2" }])).toEqual({ itemsNew: 0, itemsUpdated: 1 });
    expect(await prisma.collectedItem.count()).toBe(1);
    const rev = await prisma.itemRevision.findFirstOrThrow();
    expect(rev.previousTitle).toBe("Original title");
  });

  it("groups the same article from two sources by canonical URL", async () => {
    const a = await makeSource();
    const b = await makeSource();
    const base = { excerpt: "", author: null, publishedAt: new Date(), sourceUpdatedAt: null };
    await upsertItems(a, [{ ...base, guid: "a", url: "https://news.example/story?utm_source=rss", title: "Water utility HMI breach" }]);
    await upsertItems(b, [{ ...base, guid: "b", url: "https://www.news.example/story/", title: "Different headline entirely" }]);
    const items = await prisma.collectedItem.findMany();
    expect(items[0].duplicateGroupId).toBeTruthy();
    expect(items[0].duplicateGroupId).toBe(items[1].duplicateGroupId);
  });

  it("groups similar headlines from different sources", async () => {
    const a = await makeSource();
    const b = await makeSource();
    const base = { excerpt: "", author: null, publishedAt: new Date(), sourceUpdatedAt: null };
    await upsertItems(a, [{ ...base, guid: "a", url: "https://a.example/1", title: "Hackers target Rockwell PLCs at US water utilities" }]);
    await upsertItems(b, [{ ...base, guid: "b", url: "https://b.example/2", title: "Hackers target Rockwell PLCs at water utilities in US" }]);
    const groups = await prisma.duplicateGroup.findMany({ include: { items: true } });
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("does not auto-merge on a shared CVE alone (signal only)", async () => {
    const a = await makeSource();
    const b = await makeSource();
    const base = { author: null, publishedAt: new Date(), sourceUpdatedAt: null };
    await upsertItems(a, [{ ...base, guid: "a", url: "https://a.example/1", title: "Vendor advisory for gateway", excerpt: "CVE-2026-5555" }]);
    await upsertItems(b, [{ ...base, guid: "b", url: "https://b.example/2", title: "Researchers publish exploit write-up", excerpt: "CVE-2026-5555" }]);
    const items = await prisma.collectedItem.findMany({ orderBy: { collectedAt: "asc" } });
    expect(items.every((i) => i.duplicateGroupId === null)).toBe(true);
    expect(items[1].suggestedGroupIds).toEqual([items[0].id]);
  });

  it("never groups same-source items or items with different advisory IDs", async () => {
    const a = await makeSource();
    const b = await makeSource();
    const base = { excerpt: "", author: null, publishedAt: new Date(), sourceUpdatedAt: null };
    await upsertItems(a, [
      { ...base, guid: "1", url: "https://a.example/1", title: "CISA Adds Two Known Exploited Vulnerabilities to Catalog" },
      { ...base, guid: "2", url: "https://a.example/2", title: "CISA Adds Two Known Exploited Vulnerabilities to Catalog" },
    ]);
    await upsertItems(b, [{ ...base, guid: "3", url: "https://b.example/3", title: "SSA-111111: Deserialization in SIMATIC" }]);
    await upsertItems(a, [{ ...base, guid: "4", url: "https://a.example/4", title: "SSA-222222: Deserialization in SIMATIC" }]);
    expect(await prisma.duplicateGroup.count()).toBe(0);
  });

  it("archives old back-catalogue items instead of flooding the inbox", async () => {
    const s = await makeSource();
    await upsertItems(s, [{ guid: "old", url: "https://x.example/old", title: "Old advisory", excerpt: "", author: null, publishedAt: new Date("2020-01-01"), sourceUpdatedAt: null }]);
    expect((await prisma.collectedItem.findFirstOrThrow()).inboxStatus).toBe("archived");
  });
});
