import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle } from "@/components/admin/ui";
import { socialImportAction } from "../../actions";

export const metadata: Metadata = { title: "Social import" };

const EXAMPLE = `{
  "version": 1,
  "posts": [
    {
      "platform": "x",
      "author": "@example_researcher",
      "url": "https://x.com/example_researcher/status/123",
      "publishedAt": "2026-10-29T08:00:00Z",
      "text": "Short excerpt of the post",
      "linkedPrimarySource": "https://www.cisa.gov/news-events/ics-advisories/..."
    }
  ]
}`;

export default async function ImportPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Social import" />
      <div className="-mt-3 mb-6 max-w-[72ch] space-y-2 text-sm text-slate">
        <p>Bring in social posts you found yourself or exported from a separate discovery tool. Every imported post enters the inbox as an unverified item, and a story built only from social posts cannot be marked as verified.</p>
        <p>This app never logs in to social networks and never stores cookies. Tools such as Agent Reach must be installed and run separately by you; convert their output to the JSON format below.</p>
      </div>
      <div className="grid gap-10 xl:grid-cols-2">
        <form action={socialImportAction} encType="multipart/form-data" className="space-y-4 text-sm">
          <Csrf />
          <h2 className="text-lg font-semibold">Upload a JSON file</h2>
          <input name="file" type="file" accept="application/json,.json" className="block" />
          <button className="btn btn-primary">Import file</button>
          <pre className="overflow-auto rounded-md bg-panel p-3 text-xs">{EXAMPLE}</pre>
          <p className="text-xs text-slate">Up to 500 posts and 2 MB per file. Only url and platform are required.</p>
        </form>
        <form action={socialImportAction} className="space-y-3 text-sm">
          <Csrf />
          <h2 className="text-lg font-semibold">Add one post by hand</h2>
          <label className="block"><span className="mb-1 block font-medium">Post URL</span><input name="postUrl" type="url" required className="field" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block font-medium">Platform</span><input name="platform" placeholder="x, linkedin, mastodon…" required className="field" /></label>
            <label className="block"><span className="mb-1 block font-medium">Author</span><input name="author" className="field" /></label>
          </div>
          <label className="block"><span className="mb-1 block font-medium">Published</span><input name="publishedAt" type="datetime-local" className="field" /></label>
          <label className="block"><span className="mb-1 block font-medium">Excerpt</span><textarea name="text" rows={3} className="field" /></label>
          <label className="block"><span className="mb-1 block font-medium">Linked primary source (if any)</span><input name="linkedPrimarySource" type="url" className="field" /></label>
          <button className="btn btn-primary">Add to inbox</button>
        </form>
      </div>
    </>
  );
}
