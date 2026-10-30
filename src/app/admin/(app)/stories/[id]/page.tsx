import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { getAIProvider, type StorySuggestion } from "@/lib/ai/provider";
import { TRANSITIONS } from "@/lib/stories/workflow";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, fmtDateTime } from "@/components/admin/ui";
import { DemoBadge, VerificationLamp } from "@/components/Lamp";
import { saveStoryAction, transitionStoryAction, linkItemAction, unlinkItemAction, aiSuggestAction } from "../../../actions";

const ACTION_LABEL: Record<string, string> = {
  approved: "Approve",
  published: "Publish",
  draft: "Move back to draft",
  rejected: "Reject",
};

export default async function StoryEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const story = await prisma.story.findUnique({
    where: { id },
    include: { sources: { include: { item: { include: { source: true } } } } },
  });
  if (!story) notFound();
  const [audits, suggestionRow] = await Promise.all([
    prisma.auditEvent.findMany({ where: { objectType: "story", objectId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.appSetting.findUnique({ where: { key: `ai.suggestion.${id}` } }),
  ]);
  const ai = getAIProvider();
  const suggestion = suggestionRow?.value as (StorySuggestion & { at: string }) | undefined;
  const hasPrimary = story.sources.some((s) => s.item.source.trustLevel === "primary_vendor" || s.item.source.trustLevel === "government_cert");
  const locked = story.editorialStatus === "published";

  const field = (name: keyof typeof story, label: string, opts: { rows?: number; hint?: string; value?: string } = {}) => {
    const value = opts.value ?? (Array.isArray(story[name]) ? (story[name] as string[]).join(", ") : ((story[name] as string | null) ?? ""));
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{label}</span>
        {opts.rows ? <textarea name={name} rows={opts.rows} defaultValue={value} className="field" /> : <input name={name} defaultValue={value} className="field" />}
        {opts.hint && <span className="mt-1 block text-xs text-slate">{opts.hint}</span>}
      </label>
    );
  };

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <nav className="mb-3 text-sm"><Link href="/admin/stories">Stories</Link></nav>
      <PageTitle title={story.headline}>
        <Link href={`/admin/stories/${id}/preview`} className="btn btn-secondary" target="_blank">Preview public page</Link>
        {story.editorialStatus === "published" && <Link href={`/stories/${story.slug}`} className="btn btn-secondary" target="_blank">View live</Link>}
      </PageTitle>
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-4 text-sm">
        <span className="rounded-full border border-line px-3 py-0.5 font-medium capitalize">{story.editorialStatus}</span>
        <VerificationLamp status={story.verificationStatus} />
        {story.isDemo && <DemoBadge />}
        {story.aiAssisted && <span className="text-lamp-amber">AI-assisted draft</span>}
      </div>

      <section aria-labelledby="workflow" className="mb-8 rounded-lg border border-line bg-panel p-4">
        <h2 id="workflow" className="font-semibold">Workflow</h2>
        <p className="mt-1 text-sm text-slate">
          Draft → Approved → Published. Approval needs a summary and at least one source. Publishing is only possible from Approved and makes the story public.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {TRANSITIONS[story.editorialStatus].map((to) =>
            to === "published" ? (
              <form key={to} action={transitionStoryAction} className="flex flex-wrap items-center gap-3 rounded-md border border-teal/40 bg-white p-2">
                <Csrf />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="published" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmPublish" value="yes" className="accent-teal" required />
                  I have checked this story against its sources
                </label>
                <button className="btn btn-primary">Publish</button>
              </form>
            ) : (
              <form key={to} action={transitionStoryAction}>
                <Csrf />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={to} />
                <button className={to === "rejected" ? "btn btn-danger" : to === "approved" ? "btn btn-primary" : "btn btn-secondary"}>{ACTION_LABEL[to]}</button>
              </form>
            ),
          )}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <form action={saveStoryAction} className="space-y-4">
          <Csrf />
          <input type="hidden" name="id" value={id} />
          {locked && <p className="rounded-md bg-amber-50 p-3 text-sm">This story is live. Saving changes updates the public page immediately and shows an “updated” date. For larger corrections, move it back to draft first.</p>}
          {field("headline", "Headline")}
          {field("summary", "Editorial summary", { rows: 6, hint: "Write from the linked sources only. Separate paragraphs with a blank line." })}
          {field("whyItMatters", "Why it matters", { rows: 3 })}
          {field("defensiveGuidance", "Defensive guidance", { rows: 3, hint: "Repeat what the vendor or advisory recommends. Don't invent mitigations." })}
          {field("guidanceSource", "Guidance comes from", { hint: "e.g. Siemens SSA-123456 or CISA ICSA-26-300-01. Required if you give guidance." })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("vendors", "Vendors", { hint: "Comma-separated" })}
            {field("products", "Affected products", { hint: "Comma-separated" })}
          </div>
          {field("affectedVersions", "Affected versions", { hint: "Leave empty if unknown. The public page will say “Unknown”." })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("cveIds", "CVE IDs", { hint: "Comma-separated, e.g. CVE-2026-12345" })}
            {field("advisoryIds", "Advisory IDs", { hint: "e.g. ICSA-26-300-01, SSA-123456" })}
          </div>
          {field("categories", "Categories", { hint: "Comma-separated, e.g. ics-advisories, vendor-advisories, ot-research" })}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Verification</span>
            <select name="verificationStatus" defaultValue={story.verificationStatus} className="field">
              <option value="unverified">Unverified</option>
              <option value="partially_verified">Partially verified</option>
              <option value="verified_primary" disabled={!hasPrimary}>Verified against primary source{!hasPrimary ? " (needs a vendor or CERT source)" : ""}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aiAssisted" defaultChecked={story.aiAssisted} className="accent-teal" />
            This draft used AI suggestions
          </label>
          <button className="btn btn-primary">Save story</button>
        </form>

        <aside className="space-y-6 text-sm">
          <section>
            <h2 className="mb-2 font-semibold">Linked sources ({story.sources.length})</h2>
            <ul className="space-y-3">
              {story.sources.map(({ item }) => (
                <li key={item.id} className="rounded-md border border-line p-3">
                  <Link href={`/admin/inbox/${item.id}`} className="font-medium">{item.title}</Link>
                  <p className="text-xs text-slate">{item.source.name} — {item.source.trustLevel.replace("_", " ")} — {fmtDateTime(item.publishedAt)}</p>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs">Open original</a>}
                  <form action={unlinkItemAction} className="mt-1">
                    <Csrf />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="text-xs text-danger underline">Remove source</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={linkItemAction} className="mt-3 flex gap-2">
              <Csrf />
              <input type="hidden" name="id" value={id} />
              <label className="sr-only" htmlFor="link-item">Item ID</label>
              <input id="link-item" name="itemId" placeholder="Item ID from the inbox" className="field" />
              <button className="btn btn-secondary">Add</button>
            </form>
          </section>

          <section className="rounded-lg border border-line p-4">
            <h2 className="font-semibold">AI suggestion</h2>
            {!ai.enabled ? (
              <p className="mt-1 text-slate">Off. Set AI_PROVIDER, ANTHROPIC_API_KEY and AI_MODEL to enable draft suggestions.</p>
            ) : (
              <form action={aiSuggestAction} className="mt-2">
                <Csrf />
                <input type="hidden" name="id" value={id} />
                <button className="btn btn-secondary">Suggest a draft from sources</button>
              </form>
            )}
            {suggestion && (
              <div className="mt-3 space-y-2 rounded-md border border-lamp-amber/40 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-lamp-amber">AI suggestion — review required. Not saved to the story.</p>
                <p><strong>Summary:</strong> {suggestion.summary}</p>
                <p><strong>Why it matters:</strong> {suggestion.whyItMatters}</p>
                {suggestion.vendors.length > 0 && <p><strong>Vendors:</strong> {suggestion.vendors.join(", ")}</p>}
                {suggestion.products.length > 0 && <p><strong>Products:</strong> {suggestion.products.join(", ")}</p>}
                {suggestion.unknowns.length > 0 && <p><strong>Not established by sources:</strong> {suggestion.unknowns.join("; ")}</p>}
                <p className="text-xs text-slate">Generated {fmtDateTime(new Date(suggestion.at))}. Copy only what you have checked.</p>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">History</h2>
            <ul className="space-y-1 text-xs text-slate">
              {audits.map((a) => <li key={a.id}>{fmtDateTime(a.createdAt)} — {a.action.replace("story.", "")} by {a.actor}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
