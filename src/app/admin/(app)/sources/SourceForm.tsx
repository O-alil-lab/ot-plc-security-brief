import type { Source } from "@prisma/client";
import { Csrf } from "@/components/admin/Csrf";
import { saveSourceAction } from "../../actions";

export function SourceForm({ source }: { source?: Source }) {
  return (
    <form action={saveSourceAction} className="space-y-4 text-sm">
      <Csrf />
      {source && <input type="hidden" name="id" value={source.id} />}
      <label className="block">
        <span className="mb-1 block font-medium">Name</span>
        <input name="name" required defaultValue={source?.name} className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Feed URL</span>
        <input name="url" type="url" required defaultValue={source?.url ?? ""} placeholder="https://" className="field" />
        <span className="mt-1 block text-xs text-slate">Must be a public http(s) address. Private, local and cloud-metadata addresses are rejected.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Format</span>
          <select name="type" defaultValue={source?.type ?? "rss"} className="field">
            <option value="rss">RSS</option>
            <option value="atom">Atom</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Trust level</span>
          <select name="trustLevel" defaultValue={source?.trustLevel ?? "news"} className="field">
            <option value="primary_vendor">Primary: vendor advisory</option>
            <option value="government_cert">Primary: government CERT</option>
            <option value="research">Research</option>
            <option value="news">News</option>
            <option value="social">Social (always unverified)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Category</span>
          <input name="category" required defaultValue={source?.category ?? "ot-news"} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Poll every (minutes)</span>
          <input name="pollIntervalMinutes" type="number" min={30} max={10080} required defaultValue={source?.pollIntervalMinutes ?? 60} className="field" />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={source?.enabled ?? true} className="accent-teal" />
        Enabled
      </label>
      <button className="btn btn-primary">{source ? "Save source" : "Add source"}</button>
    </form>
  );
}
