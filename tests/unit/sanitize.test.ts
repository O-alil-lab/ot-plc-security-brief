import { describe, it, expect } from "vitest";
import { sanitizeRichHtml, toPlainText, safeHttpUrl } from "@/lib/sanitize";
import { escapeHtml } from "@/lib/newsletter/render";

describe("sanitisation", () => {
  it("strips scripts, event handlers and javascript: URLs", () => {
    const out = sanitizeRichHtml(`<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.example">ok</a><iframe src="https://x"></iframe><img src=x onerror=y></p>`);
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe|<img/i);
    expect(out).toContain('href="https://ok.example"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("produces plain text with a length cap", () => {
    expect(toPlainText("<b>Bold</b> &amp; <i>it</i>")).toBe("Bold & it");
    expect(toPlainText("a".repeat(50), 10)).toHaveLength(10);
  });

  it("only accepts http(s) URLs without credentials", () => {
    expect(safeHttpUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("https://u:p@example.com")).toBeNull();
  });

  it("escapes HTML for email templates", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  });
});
