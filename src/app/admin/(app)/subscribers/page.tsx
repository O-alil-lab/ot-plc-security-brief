import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { PageTitle, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Subscribers" };

export default async function SubscribersPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = typeof sp.email === "string" ? sp.email.trim().toLowerCase() : "";
  const [groups, found] = await Promise.all([
    prisma.subscriber.groupBy({ by: ["status"], _count: true }),
    q ? prisma.subscriber.findUnique({ where: { email: q } }) : null,
  ]);
  const c = Object.fromEntries(groups.map((g) => [g.status, g._count])) as Record<string, number>;
  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Subscribers">
        <a href="/api/admin/subscribers/export" className="btn btn-secondary">Export CSV</a>
      </PageTitle>
      <dl className="mb-8 grid gap-3 text-sm sm:grid-cols-4">
        {(["active", "pending", "unsubscribed", "bounced"] as const).map((s) => (
          <div key={s} className="rounded-md border border-line p-3"><dt className="capitalize text-slate">{s === "pending" ? "Awaiting confirmation" : s}</dt><dd className="text-2xl font-semibold">{c[s] ?? 0}</dd></div>
        ))}
      </dl>
      <form method="get" className="flex max-w-md gap-2 text-sm">
        <label htmlFor="email" className="sr-only">Exact email address</label>
        <input id="email" name="email" type="email" defaultValue={q} placeholder="Find by exact email" className="field" />
        <button className="btn btn-secondary">Find</button>
      </form>
      {q && (
        <div className="mt-4 max-w-md rounded-md border border-line p-4 text-sm">
          {found ? (
            <dl className="space-y-1">
              <div><dt className="inline font-medium">Status: </dt><dd className="inline">{found.status}</dd></div>
              <div><dt className="inline font-medium">Consent: </dt><dd className="inline">{fmtDateTime(found.consentAt)} (text {found.consentTextVersion})</dd></div>
              <div><dt className="inline font-medium">Confirmed: </dt><dd className="inline">{fmtDateTime(found.confirmedAt)}</dd></div>
              <div><dt className="inline font-medium">Unsubscribed: </dt><dd className="inline">{fmtDateTime(found.unsubscribedAt)}</dd></div>
              <div><dt className="inline font-medium">Signed up via: </dt><dd className="inline">{found.signupSource}</dd></div>
            </dl>
          ) : (
            <p>No subscriber with that address.</p>
          )}
        </div>
      )}
      <p className="mt-6 max-w-[70ch] text-xs text-slate">Exports are logged in the audit log. Store exported files securely and delete them when you no longer need them.</p>
    </>
  );
}
