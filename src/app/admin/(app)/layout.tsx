import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logoutAction } from "../actions";
import { Csrf } from "@/components/admin/Csrf";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Editorial dashboard", template: "%s | Editorial dashboard" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/stories", label: "Stories" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/import", label: "Social import" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  const [inboxNew, pendingSubs, demo] = await Promise.all([
    prisma.collectedItem.count({ where: { inboxStatus: "new" } }),
    prisma.submission.count({ where: { status: "pending" } }),
    prisma.source.count({ where: { isDemo: true } }),
  ]);
  const devMail = env.emailProvider === "console";

  return (
    <div className="min-h-screen bg-panel">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
      {demo > 0 && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-ink">
          Demo data is loaded. Items and stories marked DEMO are fictional. Remove them with <code>npm run seed:demo -- --clear</code>.
        </p>
      )}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[13rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Link href="/admin" className="flex items-center gap-2 text-ink no-underline">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-teal ring-4 ring-teal/30" />
            <span className="font-display font-semibold">Editorial dashboard</span>
          </Link>
          <nav aria-label="Admin" className="mt-5">
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm text-ink no-underline hover:bg-white">
                    {n.label}
                    {n.href === "/admin/inbox" && inboxNew > 0 && <span className="rounded-full bg-teal px-2 text-xs text-white">{inboxNew}</span>}
                    {n.href === "/admin/submissions" && pendingSubs > 0 && <span className="rounded-full bg-lamp-amber px-2 text-xs text-white">{pendingSubs}</span>}
                  </Link>
                </li>
              ))}
              {devMail && (
                <li>
                  <Link href="/admin/mailbox" className="block rounded-md px-3 py-1.5 text-sm text-ink no-underline hover:bg-white">Dev mailbox</Link>
                </li>
              )}
            </ul>
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-sm text-slate">
            <p className="truncate" title={session.email}>{session.email}</p>
            <div className="mt-2 flex gap-3">
              <Link href="/" target="_blank">View site</Link>
              <form action={logoutAction}>
                <Csrf />
                <button className="text-teal underline">Sign out</button>
              </form>
            </div>
          </div>
        </aside>
        <main id="admin-main" className="min-w-0 rounded-lg border border-line bg-white p-5 sm:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
