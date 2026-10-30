import { describe, it, expect } from "vitest";
import { normalizeUrl, extractIds, headlineSimilarity } from "@/lib/ingest/normalize";

describe("normalisation", () => {
  it("normalises URLs for dedup", () => {
    expect(normalizeUrl("HTTP://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/a/b?a=1&b=2");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("extracts CVE and advisory identifiers", () => {
    expect(extractIds("See CVE-2026-1234 and cve-2025-99999, ICSA-26-300-01, SSA-123456, VU#123456, FG-IR-26-001")).toEqual(
      ["CVE-2025-99999", "CVE-2026-1234", "FG-IR-26-001", "ICSA-26-300-01", "SSA-123456", "VU#123456"],
    );
  });

  it("scores headline similarity", () => {
    expect(headlineSimilarity("Siemens SIMATIC S7-1500 flaw allows DoS", "SIMATIC S7-1500 flaw allows DoS, Siemens says")).toBeGreaterThan(0.6);
    expect(headlineSimilarity("Siemens SIMATIC flaw", "Krebs on ransomware gangs")).toBeLessThan(0.2);
  });
});
