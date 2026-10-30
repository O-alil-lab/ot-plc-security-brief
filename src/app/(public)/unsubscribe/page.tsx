import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Unsubscribe</h1>
      {status === "done" ? (
        <p role="status" className="mt-4">You&apos;re unsubscribed. You won&apos;t receive any more issues of the brief.</p>
      ) : status === "invalid" ? (
        <p role="alert" className="mt-4">This unsubscribe link isn&apos;t valid. Use the link from the most recent issue, or reply to any newsletter and we&apos;ll remove you.</p>
      ) : token ? (
        <form method="post" action="/api/unsubscribe" className="mt-4 space-y-4">
          <input type="hidden" name="token" value={token} />
          <p>Stop receiving the OT &amp; PLC Security Brief?</p>
          <button className="btn btn-primary">Unsubscribe</button>
        </form>
      ) : (
        <p className="mt-4 text-slate">Use the unsubscribe link at the bottom of any issue. Every email has one, and it works with a single click.</p>
      )}
      <p className="mt-10 text-sm text-slate">Draft copy — the operator must review this page for applicable email and privacy law.</p>
    </div>
  );
}
