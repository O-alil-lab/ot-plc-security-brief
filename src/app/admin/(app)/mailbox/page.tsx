import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth/session";
import { PageTitle, Empty, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Dev mailbox" };

/** Only available with EMAIL_PROVIDER=console. Shows what would have been emailed. */
export default async function MailboxPage() {
  await requireAdminPage();
  if (env.emailProvider !== "console") notFound();
  const messages = await prisma.devOutboxMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <>
      <PageTitle title="Dev mailbox" />
      <p className="-mt-3 mb-5 max-w-[70ch] text-sm text-slate">Development mode: these emails were not sent. Confirmation links here work, so you can test subscribe and unsubscribe locally.</p>
      {messages.length === 0 ? (
        <Empty title="No messages yet.">Subscribe on the public site or send a test issue.</Empty>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-lg border border-line p-4 text-sm">
              <details>
                <summary className="cursor-pointer">
                  <strong>{m.subject}</strong> <span className="text-slate">to {m.to} — {fmtDateTime(m.createdAt)}</span>
                </summary>
                {m.headers && Object.keys(m.headers as object).length > 0 && <pre className="mt-2 overflow-auto text-xs text-slate">{JSON.stringify(m.headers, null, 2)}</pre>}
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-panel p-3 text-xs">
                  {m.text.split(/(https?:\/\/\S+)/g).map((part, i) =>
                    // Only links back to this app are made clickable (confirm / unsubscribe / story links).
                    part.startsWith(env.baseUrl) ? <a key={i} href={part.slice(env.baseUrl.length) || "/"}>{part}</a> : part,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
