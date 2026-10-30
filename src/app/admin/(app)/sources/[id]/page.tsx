import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { nextDueAt } from "@/lib/ingest/ingest";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, HealthLamp, sourceHealth, fmtDateTime, FETCH_STATUS_LABEL } from "@/components/admin/ui";
import { runSourceAction } from "../../../actions";
import { SourceForm } from "../SourceForm";

export default async function SourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const source = await prisma.source.findUnique({ where: { id }, include: { runs: { orderBy: { startedAt: "desc" }, take: 25 } } });
  if (!source) notFound();
  const fetchable = !!source.url && (source.type === "rss" || source.type === "atom");

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <nav className="mb-3 text-sm"><Link href="/admin/sources">Sources</Link></nav>
      <PageTitle title={source.name}>
        {fetchable && !source.isDemo && (
          <form action={runSourceAction}>
            <Csrf />
            <input type="hidden" name="id" value={source.id} />
            <button className="btn btn-primary">Fetch now</button>
          </form>
        )}
      </PageTitle>
      <dl className="mb-8 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line p-3"><dt className="font-medium">Health</dt><dd><HealthLamp health={fetchable ? sourceHealth(source) : "off"} /></dd></div>
        <div className="rounded-md border border-line p-3"><dt className="font-medium">Last success</dt><dd className="text-slate">{fmtDateTime(source.lastSuccessAt)}</dd></div>
        <div className="rounded-md border border-line p-3"><dt className="font-medium">Consecutive failures</dt><dd className="text-slate">{source.consecutiveFailures}</dd></div>
        <div className="rounded-md border border-line p-3"><dt className="font-medium">Next scheduled fetch</dt><dd className="text-slate">{fetchable && source.enabled ? fmtDateTime(nextDueAt(source)) : "Not scheduled"}</dd></div>
      </dl>
      {source.lastError && (
        <p role="alert" className="mb-6 rounded-md border border-danger/30 bg-red-50 p-3 text-sm">
          <strong>Last error:</strong> {source.lastStatus ? FETCH_STATUS_LABEL[source.lastStatus] : ""} — {source.lastError}
        </p>
      )}

      <div className="grid gap-10 xl:grid-cols-[1fr_24rem]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fetch history</h2>
          {source.runs.length === 0 ? (
            <p className="text-sm text-slate">No fetches yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-slate">
                <tr><th className="py-2">Started</th><th className="py-2">Result</th><th className="py-2">Seen / new / updated</th><th className="py-2">Trigger</th></tr>
              </thead>
              <tbody>
                {source.runs.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top">
                    <td className="py-2 pr-3">{fmtDateTime(r.startedAt)}</td>
                    <td className="py-2 pr-3">
                      <span className={r.status === "ok" ? "" : "font-semibold text-danger"}>{FETCH_STATUS_LABEL[r.status]}{r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}</span>
                      {r.error && <span className="block text-xs text-slate">{r.error}</span>}
                    </td>
                    <td className="py-2">{r.status === "ok" ? `${r.itemsSeen} / ${r.itemsNew} / ${r.itemsUpdated}` : "—"}</td>
                    <td className="py-2 text-slate">{r.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {fetchable && !source.isDemo && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Settings</h2>
            <SourceForm source={source} />
          </section>
        )}
      </div>
    </>
  );
}
