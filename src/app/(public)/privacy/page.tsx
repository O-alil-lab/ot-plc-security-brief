import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p role="note" className="rounded-md border border-lamp-amber/40 bg-amber-50 p-3 text-sm">
        Draft copy. The operator of this site must review this policy for the privacy and email-marketing laws that apply where they and their readers are located before going live.
      </p>
      <h1 className="mt-6 text-3xl font-bold">Privacy</h1>
      <div className="prose-brief mt-6 space-y-6">
        <section>
          <h2 className="mb-2 text-xl font-semibold">What we collect</h2>
          <p>If you subscribe: your email address, when you gave consent, which version of the consent text you agreed to, and when you confirmed or unsubscribed.</p>
          <p>If you submit a story: the link, your optional note, and your email only if you choose to give it. We keep a one-way hash of your IP address to limit spam; we can&apos;t turn it back into your address.</p>
          <p>We don&apos;t use advertising trackers or sell personal data.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">How we use it</h2>
          <p>To send the newsletter you asked for, to respond to your submission, and to prevent abuse. Subscriber data is never sent to AI services.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Email delivery</h2>
          <p>We use an email delivery provider to send the newsletter. They process your address only to deliver our email.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Your choices</h2>
          <p>Every email has a one-click unsubscribe link. To ask for a copy or deletion of your data, reply to any newsletter.</p>
        </section>
      </div>
    </div>
  );
}
