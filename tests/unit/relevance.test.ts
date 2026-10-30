import { describe, it, expect } from "vitest";
import { scoreRelevance } from "@/lib/ingest/relevance";

const now = new Date("2026-10-30T00:00:00Z");

describe("relevance", () => {
  it("scores industrial advisories above generic IT news", () => {
    const ot = scoreRelevance({ title: "Siemens SIMATIC PLC remote code execution", excerpt: "SCADA HMI", identifiers: ["CVE-2026-1"], trustLevel: "primary_vendor", publishedAt: now, now });
    const it_ = scoreRelevance({ title: "Office VPN update", excerpt: "Patch now", identifiers: ["CVE-2026-2"], trustLevel: "primary_vendor", publishedAt: now, now });
    expect(ot.total).toBeGreaterThan(60);
    expect(it_.total).toBeLessThanOrEqual(15);
    expect(ot.vendors).toContain("Siemens");
    expect(ot.note).toMatch(/not severity/);
  });

  it("matches short acronyms only as whole, upper-case words", () => {
    expect(scoreRelevance({ title: "Applications explained", identifiers: [], trustLevel: "news", now }).terms).not.toContain("PLC");
    expect(scoreRelevance({ title: "physics of HMIs", identifiers: [], trustLevel: "news", now }).terms).not.toContain("HMI");
    expect(scoreRelevance({ title: "New PLC worm", identifiers: [], trustLevel: "news", now }).terms).toContain("PLC");
  });

  it("is deterministic and bounded", () => {
    const input = { title: "PLC SCADA HMI ICS DCS RTU Modbus DNP3 Siemens Rockwell ABB", identifiers: ["CVE-1"], trustLevel: "government_cert" as const, publishedAt: now, now };
    expect(scoreRelevance(input)).toEqual(scoreRelevance(input));
    expect(scoreRelevance(input).total).toBeLessThanOrEqual(100);
  });
});
