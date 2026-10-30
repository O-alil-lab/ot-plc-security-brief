import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
      <p className="text-sm text-slate">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold">This page doesn&apos;t exist</h1>
      <p className="mt-3 text-slate">The story or issue may have been unpublished or the link may be mistyped.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/feed" className="btn btn-primary">Browse the news feed</Link>
        <Link href="/" className="btn btn-secondary">Home</Link>
      </div>
    </main>
  );
}
