import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

// Confirmation needs a button press (POST) so that email link scanners which
// pre-fetch URLs cannot confirm a subscription on someone's behalf.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Confirm your subscription</h1>
      {status === "confirmed" ? (
        <p role="status" className="mt-4">You&apos;re subscribed. The next issue will arrive in your inbox. <Link href="/feed">Read the latest stories</Link>.</p>
      ) : status === "invalid" ? (
        <p role="alert" className="mt-4">This confirmation link has expired or was already used. <Link href="/">Subscribe again</Link> to get a new link.</p>
      ) : token ? (
        <form method="post" action="/api/subscribe/confirm" className="mt-4 space-y-4">
          <input type="hidden" name="token" value={token} />
          <p>Press the button to start receiving the OT &amp; PLC Security Brief.</p>
          <button className="btn btn-primary">Confirm subscription</button>
        </form>
      ) : (
        <p className="mt-4 text-slate">Open the confirmation link from the email we sent you.</p>
      )}
    </div>
  );
}
