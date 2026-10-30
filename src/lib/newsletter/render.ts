import type { CollectedItem, NewsletterIssue, Source, Story } from "@prisma/client";
import { env } from "../env";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type IssueForRender = NewsletterIssue & {
  stories: { position: number; story: Story & { sources: { item: CollectedItem & { source: Source } }[] } }[];
};

const VERIFICATION_LABEL: Record<Story["verificationStatus"], string> = {
  unverified: "Unverified",
  partially_verified: "Partially verified",
  verified_primary: "Verified against primary source",
};

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "date unknown";
}

/** Render an issue to accessible HTML email + plain text. */
export function renderIssue(issue: IssueForRender, opts: { unsubscribeUrl: string; isTest?: boolean }) {
  const base = env.baseUrl;
  const stories = [...issue.stories].sort((a, b) => a.position - b.position).map((s) => s.story);
  const navy = "#0f1f33";
  const teal = "#0f766e";

  const storyHtml = stories
    .map((s) => {
      const sources = s.sources
        .map(
          ({ item }) =>
            `<li style="margin:0 0 4px 0;"><a href="${escapeHtml(item.url ?? "#")}" style="color:${teal};">${escapeHtml(item.source.name)}</a> <span style="color:#475569;">(${fmtDate(item.publishedAt)})</span></li>`,
        )
        .join("");
      const ids = [...s.cveIds, ...s.advisoryIds];
      return `
<tr><td style="padding:20px 0;border-top:1px solid #e2e8f0;">
  <h2 style="margin:0 0 6px 0;font-size:19px;line-height:1.3;color:${navy};"><a href="${base}/stories/${escapeHtml(s.slug)}" style="color:${navy};text-decoration:none;">${escapeHtml(s.headline)}</a></h2>
  <p style="margin:0 0 10px 0;font-size:13px;color:#475569;">${escapeHtml(VERIFICATION_LABEL[s.verificationStatus])}${s.vendors.length ? ` · ${escapeHtml(s.vendors.join(", "))}` : ""}${ids.length ? ` · ${escapeHtml(ids.slice(0, 6).join(", "))}` : ""}</p>
  ${paragraphsHtml(s.summary)}
  ${s.whyItMatters ? `<p style="margin:0 0 12px 0;"><strong>Why it matters:</strong> ${escapeHtml(s.whyItMatters)}</p>` : ""}
  ${s.defensiveGuidance ? `<p style="margin:0 0 12px 0;"><strong>Defensive guidance${s.guidanceSource ? ` (per ${escapeHtml(s.guidanceSource)})` : ""}:</strong> ${escapeHtml(s.defensiveGuidance)}</p>` : ""}
  <p style="margin:0 0 4px 0;font-size:13px;"><strong>Sources</strong></p>
  <ul style="margin:0;padding-left:18px;font-size:13px;">${sources}</ul>
</td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(issue.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(issue.previewText)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;">
<tr><td style="background:${navy};padding:20px 24px;border-radius:8px 8px 0 0;">
  ${opts.isTest ? `<p style="margin:0 0 6px 0;color:#fde68a;font-size:12px;font-weight:bold;">TEST SEND — not sent to subscribers</p>` : ""}
  <p style="margin:0;color:#99f6e4;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">OT &amp; PLC Security Brief · Issue #${issue.number}</p>
  <h1 style="margin:6px 0 0 0;color:#ffffff;font-size:22px;line-height:1.3;">${escapeHtml(issue.title)}</h1>
</td></tr>
<tr><td style="padding:20px 24px 0 24px;">${paragraphsHtml(issue.intro)}</td></tr>
<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${storyHtml}</table></td></tr>
<tr><td style="padding:16px 24px 24px 24px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;">
  ${paragraphsHtml(issue.footer)}
  <p style="margin:0 0 8px 0;">Always follow vendor guidance and your own change-management and safety processes before changing industrial systems.</p>
  <p style="margin:0 0 8px 0;">Have a tip or correction? Reply to this email or <a href="${base}/submit" style="color:${teal};">submit a story</a>.</p>
  <p style="margin:0;"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${teal};">Unsubscribe</a> · <a href="${base}/newsletter/${issue.number}" style="color:${teal};">View in browser</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

  const textStories = stories
    .map((s, i) => {
      const sources = s.sources.map(({ item }) => `   - ${item.source.name} (${fmtDate(item.publishedAt)}): ${item.url ?? "no URL"}`).join("\n");
      return [
        `${i + 1}. ${s.headline}`,
        `   ${VERIFICATION_LABEL[s.verificationStatus]}${s.vendors.length ? ` | ${s.vendors.join(", ")}` : ""}`,
        "",
        s.summary,
        s.whyItMatters ? `\nWhy it matters: ${s.whyItMatters}` : "",
        s.defensiveGuidance ? `\nDefensive guidance${s.guidanceSource ? ` (per ${s.guidanceSource})` : ""}: ${s.defensiveGuidance}` : "",
        `\n   Read more: ${base}/stories/${s.slug}`,
        "   Sources:",
        sources,
      ].join("\n");
    })
    .join("\n\n----------------------------------------\n\n");

  const text = `${opts.isTest ? "TEST SEND — not sent to subscribers\n\n" : ""}OT & PLC SECURITY BRIEF — Issue #${issue.number}
${issue.title}

${issue.intro}

${textStories}

----------------------------------------
${issue.footer}

Always follow vendor guidance and your own change-management and safety processes before changing industrial systems.
Tips or corrections: reply to this email or visit ${base}/submit
Unsubscribe: ${opts.unsubscribeUrl}
View in browser: ${base}/newsletter/${issue.number}
`;

  return { html, text };
}
