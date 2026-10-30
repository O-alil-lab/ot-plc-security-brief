import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/provider";
import { getEmailProvider } from "@/lib/email/provider";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { PageTitle, HealthLamp, sourceHealth, ago, FETCH_STATUS_LABEL } from "@/components/admin/ui";
import { DemoBadge } from "@/components/Lamp";

export default async function Overview({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [awaiting, investigating, sources, published, drafts, subs, lastRun, kev] = await Promise.all([
    prisma.collectedItem.count({ where: { inboxStatus: "new" } }),
    prisma.collectedItem.count({ where: { inboxStatus: "investigating" } }),
    prisma.source.findMany({ where: { type: { in: ["rss", "atom"] } }, orderBy: { name: "asc" } }),
    prisma.story.findMany({ where: { editorialStatus: "published" }, orderBy: { publishedAt: "desc" }, take: 5 }),
    prisma.newsletterIssue.count({ where: { status: { in: ["draft", "reviewed"] } } }),
    prisma.subscriber.groupBy({ by: ["status"], _count: true }),
    prisma.fetchRun.findFirst({ orderBy: { startedAt: "desc" }, include: { source: { select: { name: true } } } }),
    prisma.appSetting.findUnique({ where: { key: "kev.lastSync" } }),
  ]);
  const sub = Object.fromEntries(subs.map((s) => [s.status, s._count])) as Record<string, number>;
  const health = sources.map((s) => ({ s, h: sourceHealth(s) }));
  const failing = health.filter((x) => x.h === "fail" || x.h === "warn");
  const ai = getAIProvider();
  const mail = getEmailProvider();

  const stat = (label: string, value: number | string, href: string) => (
    <Link href={href} className="block rounded-lg border border-line p-4 text-ink no-underline hover:border-teal">
      <span className="block text-3xl font-semibold">{value}</span>
      <span className="text-sm text-slate">{label}</span>
    </Link>
  );

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Overview" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stat("items awaiting review", awaiting, "/admin/inbox")}
        {stat("items under investigation", investigating, "/admin/inbox?status=investigating")}
        {stat("newsletter drafts", drafts, "/admin/newsletter")}
        {stat("active subscribers", sub.active ?? 0, "/admin/subscribers")}
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Source health</h2>
          {failing.length === 0 ? (
            <p className="text-sm text-slate">No failing sources. {sources.filter((s) => !s.lastAttemptAt && s.enabled).length > 0 && "Some sources haven't been fetched yet."}</p>
          ) : (
            <ul className="space-y-2">
              {failing.map(({ s, h }) => (
                <li key={s.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/sources/${s.id}`} className="font-medium">{s.name}</Link>
                    <HealthLamp health={h} />
                  </div>
                  <p className="mt-1 text-slate">
                    {s.lastStatus ? FETCH_STATUS_LABEL[s.lastStatus] : ""}: {s.lastError} — last success {ago(s.lastSuccessAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href="/admin/sources">All {sources.length} sources</Link> — {health.filter((x) => x.h === "ok").length} healthy, {health.filter((x) => x.h === "never").length} not fetched yet,{" "}
            {health.filter((x) => x.h === "off").length} disabled.
          </p>
          <p className="mt-1 text-sm text-slate">
            Last ingestion run: {lastRun ? <>{lastRun.source.name}, {ago(lastRun.startedAt)} ({FETCH_STATUS_LABEL[lastRun.status]})</> : "none yet. Start the worker with npm run worker."}
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Recently published</h2>
          {published.length === 0 ? (
            <p className="text-sm text-slate">Nothing published yet. Create a story from the <Link href="/admin/inbox">inbox</Link>.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {published.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 border-b border-line pb-2">
                  <Link href={`/admin/stories/${s.id}`}>{s.headline}</Link>
                  <span className="flex shrink-0 items-center gap-2 text-slate">{s.isDemo && <DemoBadge />}{ago(s.publishedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Integrations</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-line p-3">
            <dt className="font-medium">Email</dt>
            <dd className="text-slate">{mail.sendsRealEmail ? `${mail.name} (sends real email)` : "Development mode: messages go to the Dev mailbox"}</dd>
          </div>
          <div className="rounded-md border border-line p-3">
            <dt className="font-medium">AI suggestions</dt>
            <dd className="text-slate">{ai.enabled ? `On (${ai.name}). Suggestions always need review.` : "Off. The app works fully without AI."}</dd>
          </div>
          <div className="rounded-md border border-line p-3">
            <dt className="font-medium">CISA KEV</dt>
            <dd className="text-slate">{kev ? `Synced ${ago(new Date((kev.value as { at: string }).at))}` : "Not synced yet"}</dd>
          </div>
          <div className="rounded-md border border-line p-3">
            <dt className="font-medium">Subscribers</dt>
            <dd className="text-slate">{sub.active ?? 0} active, {sub.pending ?? 0} awaiting confirmation, {sub.unsubscribed ?? 0} unsubscribed</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate">Public URL: {env.baseUrl}</p>
      </section>
    </>
  );
}
