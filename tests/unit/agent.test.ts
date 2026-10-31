import { describe, it, expect } from "vitest";
import { validateSuggestion, mentionedIn } from "@/lib/agent/validate";
import { currentSendSlot } from "@/lib/agent/agent";
import { parseSuggestion, type StorySuggestion } from "@/lib/ai/provider";

const SOURCE = `Siemens ProductCERT Advisories
SSA-123456: Denial of Service in SIMATIC S7-1500 CPU
Siemens has released new versions for SIMATIC S7-1500 CPU to fix CVE-2026-11111. Siemens recommends restricting network access.`;

const good: StorySuggestion = {
  headline: "Siemens fixes denial-of-service flaw in SIMATIC S7-1500 CPUs",
  summary: "Siemens has released new versions of SIMATIC S7-1500 CPU firmware to fix CVE-2026-11111, a denial-of-service issue described in SSA-123456.",
  whyItMatters: "S7-1500 controllers run physical processes; a crash can stop production.",
  defensiveGuidance: "Restrict network access to affected devices and update.",
  guidanceSource: "Siemens SSA-123456",
  categories: ["vendor-advisories", "made-up"],
  vendors: ["Siemens", "Rockwell"],
  products: ["SIMATIC S7-1500", "ControlLogix"],
  unknowns: [],
};

describe("agent validation", () => {
  it("accepts grounded text and drops vendors/products the source doesn't mention", () => {
    const r = validateSuggestion(good, SOURCE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.story.vendors).toEqual(["Siemens"]);
    expect(r.story.products).toEqual(["SIMATIC S7-1500"]);
    expect(r.story.categories).toEqual(["vendor-advisories"]);
    expect(r.dropped).toEqual(['vendor "Rockwell"', 'product "ControlLogix"']);
  });

  it("rejects any CVE or advisory ID the source does not contain", () => {
    const r = validateSuggestion({ ...good, summary: good.summary + " A related flaw, CVE-2026-99999, is also fixed." }, SOURCE);
    expect(r).toEqual({ ok: false, reason: "summary mentions CVE-2026-99999, which the source does not" });
    expect(validateSuggestion({ ...good, guidanceSource: "Siemens SSA-654321" }, SOURCE).ok).toBe(false);
  });

  it("rejects exploitation claims the source doesn't make", () => {
    const r = validateSuggestion({ ...good, whyItMatters: "The flaw is actively exploited by attackers." }, SOURCE);
    expect(r.ok).toBe(false);
  });

  it("drops guidance without an attribution", () => {
    const r = validateSuggestion({ ...good, guidanceSource: "" }, SOURCE);
    expect(r.ok && r.story.defensiveGuidance).toBe("");
  });

  it("rejects empty or too-short drafts", () => {
    expect(validateSuggestion({ ...good, summary: "Short." }, SOURCE).ok).toBe(false);
    expect(validateSuggestion({ ...good, headline: "" }, SOURCE).ok).toBe(false);
  });

  it("matches phrases on word boundaries, ignoring case and punctuation", () => {
    expect(mentionedIn(SOURCE, "simatic s7-1500")).toBe(true);
    expect(mentionedIn(SOURCE, "S7")).toBe(true);
    expect(mentionedIn(SOURCE, "S7-15")).toBe(false);
  });

  it("parses model output defensively", () => {
    const s = parseSuggestion('Here you go:\n{"headline":"H","summary":"S","vendors":["A",3],"categories":"x"}\nThanks');
    expect(s.headline).toBe("H");
    expect(s.vendors).toEqual(["A"]);
    expect(s.categories).toEqual([]);
    expect(() => parseSuggestion("no json")).toThrow();
  });
});

describe("weekly send slot", () => {
  it("returns the latest slot at or before now", () => {
    // Monday 07:00 UTC; 2026-11-02 is a Monday.
    expect(currentSendSlot(new Date("2026-11-02T08:00:00Z"), 1, 7).toISOString()).toBe("2026-11-02T07:00:00.000Z");
    expect(currentSendSlot(new Date("2026-11-02T06:59:00Z"), 1, 7).toISOString()).toBe("2026-10-26T07:00:00.000Z");
    expect(currentSendSlot(new Date("2026-10-31T18:00:00Z"), 1, 7).toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });
});

import { cleanHeadline, trimToSentence, sameStoryText } from "@/lib/agent/agent";

describe("agent text clean-up", () => {
  it("cleans Siemens prefixes and names bare product titles", () => {
    expect(cleanHeadline("SSA-566435 V1.4 (Last Update: 2026-10-30): PHP2Shell Vulnerabilities in Siemens Software Products", "Siemens ProductCERT Advisories", [])).toBe(
      "PHP2Shell Vulnerabilities in Siemens Software Products",
    );
    expect(cleanHeadline("SSA-137528 V1.0: Authentication Bypass Vulnerability in Mendix SAML module", "Siemens ProductCERT Advisories", [])).toBe(
      "Siemens: Authentication Bypass Vulnerability in Mendix SAML module",
    );
    expect(cleanHeadline("EPICS Base", "CISA ICS Advisories", ["CVE-2026-1", "ICSA-26-300-01"])).toBe("EPICS Base: security advisory ICSA-26-300-01 (CISA ICS)");
    expect(cleanHeadline("CVE-2026-111548: Stack Buffer Overflow Vulnerability in Wireless Device Servers", "Moxa Security Advisories", [])).toBe(
      "Moxa: Stack Buffer Overflow Vulnerability in Wireless Device Servers",
    );
    expect(cleanHeadline("CVE-2026-111459, CVE-2026-111460, CVE-2026-111461: Vulnerabilities in Moxa Remote Connect Suite", "Moxa Security Advisories", [])).toBe(
      "Vulnerabilities in Moxa Remote Connect Suite",
    );
  });

  it("trims at a sentence boundary", () => {
    const t = "First sentence is here and long enough to count as content. " + "x ".repeat(400);
    expect(trimToSentence(t, 200)).toBe("First sentence is here and long enough to count as content.");
    expect(trimToSentence("Short.")).toBe("Short.");
  });

  it("recognises the same advisory republished by another source", () => {
    const siemens = { title: "SSA-137528 V1.0: Authentication Bypass Vulnerability in Mendix SAML module", excerpt: "Mendix SAML module contains an authentication bypass vulnerability that could allow an unauthenticated remote attacker to gain unauthorized access by replaying a valid SAML assertion." };
    const cisa = { title: "Siemens Mendix SAML Module", excerpt: "Mendix SAML module contains an authentication bypass vulnerability that could allow an unauthenticated remote attacker to gain unauthorized access by replaying a valid SAML assertion. Siemens has released an update." };
    const other = { title: "Hitachi Energy TRO600", excerpt: "Hitachi Energy is aware of multiple vulnerabilities that affect the TRO600 series product versions listed in this document." };
    expect(sameStoryText(siemens, cisa)).toBe(true);
    expect(sameStoryText(siemens, other)).toBe(false);
  });
});
