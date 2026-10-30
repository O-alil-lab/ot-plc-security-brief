import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { PageTitle, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireAdminPage();
  const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageTitle title="Audit log" />
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-slate">
          <tr><th className="py-2">When</th><th className="py-2">Who</th><th className="py-2">Action</th><th className="py-2">Object</th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-line align-top">
              <td className="whitespace-nowrap py-2 pr-3 text-slate">{fmtDateTime(e.createdAt)}</td>
              <td className="py-2 pr-3">{e.actor}</td>
              <td className="py-2 pr-3">{e.action}</td>
              <td className="py-2 text-xs text-slate">{e.objectType}{e.objectId ? ` ${e.objectId}` : ""}{e.metadata ? ` ${JSON.stringify(e.metadata).slice(0, 120)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
