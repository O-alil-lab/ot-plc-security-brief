import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth/session";
import { getEmailProvider } from "@/lib/email/provider";
import { renderIssue } from "@/lib/newsletter/render";
import { issueInclude, deliveryCounts } from "@/lib/newsletter/send";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, fmtDateTime } from "@/components/admin/ui";
import { saveIssueAction, reviewIssueAction, testSendAction, bulkSendAction, retryFailedAction } from "../../../actions";
import { StoryPicker } from "../StoryPicker";

export default async function IssueEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const issue = await prisma.newsletterIssue.findUnique({ where: { id }, include: issueInclude });
  if (!issue) notFound();
  const [published, counts, activeCount, failures] = await Promise.all([
    prisma.story.findMany({ where: { editorialStatus: "published" }, orderBy: { publishedAt: "desc" }, take: 60, select: { id: true, headline: true, isDemo: true } }),
    deliveryCounts(id),
    prisma.subscriber.count({ where: { status: "active" } }),
    prisma.newsletterDelivery.findMany({ where: { issueId: id, status: "failed" }, select: { error: true }, take: 5 }),
  ]);
  const editable = issue.status === "draft" || issue.status === "reviewed";
  const sentLike = !editable;
  const provider = getEmailProvider();
  const { html, text } = renderIssue(issue, { unsubscribeUrl: `${env.baseUrl}/unsubscribe` });
  const hasDemo = issue.stories.some((s) => s.story.isDemo);

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <nav className="mb-3 text-sm"><Link href="/admin/newsletter">Newsletter</Link></nav>
      <PageTitle title={`Issue #${issue.number}`} />
      <p className="-mt-3 mb-6 text-sm text-slate">
        Status: <strong className="text-ink">{issue.status.replace("_", " ")}</strong>
        {issue.reviewedAt && <> — reviewed {fmtDateTime(issue.reviewedAt)}</>}
        {issue.sendStartedAt && <> — send started {fmtDateTime(issue.sendStartedAt)}</>}
        {issue.sendFinishedAt && <> — finished {fmtDateTime(issue.sendFinishedAt)}</>}
      </p>

      {sentLike && (
        <section className="mb-8 rounded-lg border border-line bg-panel p-4 text-sm">
          <h2 className="font-semibold">Delivery</h2>
          <p className="mt-1">
            {counts.accepted} accepted by the email provider, {counts.pending} waiting, {counts.failed} failed.
            {issue.status === "sending" && " The worker is sending; refresh to see progress."}
          </p>
          <p className="mt-1 text-xs text-slate">“Accepted” means the provider took the message for delivery. It does not confirm inbox delivery.</p>
          {failures.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{failures.map((f, i) => <li key={i}>{f.error}</li>)}</ul>}
          {issue.status === "partially_failed" && (
            <form action={retryFailedAction} className="mt-3">
              <Csrf />
              <input type="hidden" name="id" value={id} />
              <button className="btn btn-secondary">Retry failed deliveries</button>
            </form>
          )}
        </section>
      )}

      <div className="grid gap-10 2xl:grid-cols-2">
        <form action={saveIssueAction} className="space-y-4 text-sm">
          <Csrf />
          <input type="hidden" name="id" value={id} />
          <fieldset disabled={!editable} className="space-y-4">
            <label className="block"><span className="mb-1 block font-medium">Title</span><input name="title" defaultValue={issue.title} className="field" /></label>
            <label className="block"><span className="mb-1 block font-medium">Email subject</span><input name="subject" defaultValue={issue.subject} className="field" /></label>
            <label className="block"><span className="mb-1 block font-medium">Preview text</span><input name="previewText" defaultValue={issue.previewText} maxLength={200} className="field" /><span className="mt-1 block text-xs text-slate">Shown next to the subject in most inboxes.</span></label>
            <label className="block"><span className="mb-1 block font-medium">Introduction</span><textarea name="intro" rows={5} defaultValue={issue.intro} className="field" /></label>
            <div>
              <p className="mb-1 font-medium">Stories (in order)</p>
              <StoryPicker available={published} initial={issue.stories.map((s) => s.storyId)} disabled={!editable} />
              <p className="mt-1 text-xs text-slate">Story summaries come from each story. Edit them in the story editor.</p>
            </div>
            <label className="block"><span className="mb-1 block font-medium">Footer</span><textarea name="footer" rows={3} defaultValue={issue.footer} className="field" /></label>
            {editable && <button className="btn btn-primary">Save issue</button>}
          </fieldset>
        </form>

        <section aria-labelledby="preview">
          <h2 id="preview" className="mb-3 text-lg font-semibold">Preview</h2>
          <details open className="mb-4">
            <summary className="cursor-pointer text-sm font-medium">Desktop (640 px)</summary>
            <iframe title="Email preview, desktop width" srcDoc={html} sandbox="" className="mt-2 h-[38rem] w-full max-w-[680px] rounded-md border border-line bg-white" />
          </details>
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium">Mobile (375 px)</summary>
            <iframe title="Email preview, mobile width" srcDoc={html} sandbox="" className="mt-2 h-[38rem] w-[375px] max-w-full rounded-md border border-line bg-white" />
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Plain-text version</summary>
            <pre className="mt-2 max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-md bg-panel p-3 text-xs">{text}</pre>
          </details>
        </section>
      </div>

      {editable && (
        <section aria-labelledby="send" className="mt-10 grid gap-6 border-t border-line pt-6 lg:grid-cols-3">
          <h2 id="send" className="sr-only">Review and send</h2>
          <form action={testSendAction} className="space-y-2 text-sm">
            <Csrf />
            <input type="hidden" name="id" value={id} />
            <h3 className="font-semibold">1. Send a test</h3>
            <p className="text-slate">{provider.sendsRealEmail ? `Sends one real email via ${provider.name}.` : "Development mode: the test goes to the Dev mailbox."}</p>
            <label className="block"><span className="sr-only">Test address</span><input name="to" type="email" required placeholder="you@example.com" className="field" /></label>
            <button className="btn btn-secondary">Send test</button>
          </form>
          <form action={reviewIssueAction} className="space-y-2 text-sm">
            <Csrf />
            <input type="hidden" name="id" value={id} />
            <h3 className="font-semibold">2. Mark as reviewed</h3>
            <p className="text-slate">Confirms an editor checked the preview. Editing the issue afterwards resets this.</p>
            <button className="btn btn-secondary" disabled={issue.status !== "draft"}>{issue.status === "reviewed" ? "Reviewed" : "Mark reviewed"}</button>
          </form>
          <form action={bulkSendAction} className="space-y-2 rounded-lg border border-danger/30 p-4 text-sm">
            <Csrf />
            <input type="hidden" name="id" value={id} />
            <h3 className="font-semibold">3. Send to subscribers</h3>
            <p className="text-slate">
              Sends to {activeCount} active subscriber{activeCount === 1 ? "" : "s"}{provider.sendsRealEmail ? ` via ${provider.name}` : " (development mode: Dev mailbox only)"}. This can&apos;t be undone and each issue can only be sent once.
            </p>
            {hasDemo && <p className="font-semibold text-lamp-amber">This issue contains DEMO stories.</p>}
            <label className="block">
              <span className="mb-1 block">Type the issue number ({issue.number}) to confirm</span>
              <input name="confirmNumber" inputMode="numeric" autoComplete="off" required className="field w-32" />
            </label>
            <button className="btn btn-primary" disabled={issue.status !== "reviewed"}>Send issue #{issue.number}</button>
            {issue.status !== "reviewed" && <p className="text-xs text-slate">Mark the issue as reviewed first.</p>}
          </form>
        </section>
      )}
    </>
  );
}
