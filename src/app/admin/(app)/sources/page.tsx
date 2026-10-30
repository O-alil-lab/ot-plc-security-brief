import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, HealthLamp, sourceHealth, ago, FETCH_STATUS_LABEL } from "@/components/admin/ui";
import { DemoBadge } from "@/components/Lamp";
import { runSourceAction, toggleSourceAction, syncKevAction } from "../../actions";
import { SourceForm } from "./SourceForm";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const sources = await prisma.source.findMany({
    orderBy: [{ trustLevel: "asc" }, { name: "asc" }],
    include: { runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { items: true } } },
  });

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Sources">
        <form action={syncKevAction}>
          <Csrf />
          <button className="btn btn-secondary">Sync CISA KEV</button>
        </form>
      </PageTitle>
      <p className="-mt-3 mb-5 max-w-[70ch] text-sm text-slate">
        The worker polls enabled RSS/Atom sources on their interval and backs off after failures. A failed fetch is always shown as a failure, never as “no new stories”.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-line text-left text-slate">
            <tr><th className="py-2">Source</th><th className="py-2">Health</th><th className="py-2">Last fetch</th><th className="py-2">Items</th><th className="py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const run = s.runs[0];
              const fetchable = !!s.url && (s.type === "rss" || s.type === "atom");
              return (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3">
                    <Link href={`/admin/sources/${s.id}`} className="font-medium">{s.name}</Link> {s.isDemo && <DemoBadge />}
                    <p className="text-xs text-slate">{s.trustLevel.replace("_", " ")} — {s.type}{fetchable ? ` — every ${s.pollIntervalMinutes} min` : ""}</p>
                  </td>
                  <td className="py-3"><HealthLamp health={fetchable ? sourceHealth(s) : "off"} /></td>
                  <td className="py-3 text-xs">
                    {run ? (
                      <>
                        <span className={run.status === "ok" ? "" : "font-semibold text-danger"}>{FETCH_STATUS_LABEL[run.status]}{run.httpStatus ? ` (HTTP ${run.httpStatus})` : ""}</span>
                        <span className="block text-slate">{ago(run.startedAt)}{run.status === "ok" ? `: ${run.itemsNew} new, ${run.itemsUpdated} updated` : ""}</span>
                        {run.status !== "ok" && run.error && <span className="block max-w-xs truncate text-slate" title={run.error}>{run.error}</span>}
                      </>
                    ) : (
                      <span className="text-slate">{fetchable ? "Never" : "Not polled"}</span>
                    )}
                  </td>
                  <td className="py-3">{s._count.items}</td>
                  <td className="py-3">
                    {fetchable && !s.isDemo && (
                      <div className="flex justify-end gap-2">
                        <form action={runSourceAction}>
                          <Csrf />
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="returnTo" value="/admin/sources" />
                          <button className="btn btn-secondary">Fetch now</button>
                        </form>
                        <form action={toggleSourceAction}>
                          <Csrf />
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="returnTo" value="/admin/sources" />
                          <button className="btn btn-secondary">{s.enabled ? "Disable" : "Enable"}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-10 max-w-2xl">
        <h2 className="mb-3 text-lg font-semibold">Add an RSS or Atom source</h2>
        <SourceForm />
      </section>
    </>
  );
}
