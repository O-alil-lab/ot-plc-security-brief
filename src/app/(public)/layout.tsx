import Link from "next/link";

const NAV = [
  { href: "/feed", label: "News feed" },
  { href: "/newsletter", label: "Newsletter archive" },
  { href: "/submit", label: "Submit a story" },
  { href: "/about", label: "Editorial standards" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 text-white no-underline hover:text-white">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-teal ring-4 ring-teal/30" />
            <span className="font-display text-lg font-semibold">OT &amp; PLC Security Brief</span>
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="text-slate-200 no-underline hover:text-white">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-slate sm:grid-cols-3 sm:px-6">
          <p className="max-w-[40ch]">
            Industrial cybersecurity news, checked against original sources. Always follow vendor guidance and your own change-management and safety processes.
          </p>
          <ul className="space-y-1">
            <li><Link href="/about">How we verify stories</Link></li>
            <li><Link href="/community-guidelines">Community guidelines</Link></li>
            <li><Link href="/submit">Report an error or submit a story</Link></li>
          </ul>
          <ul className="space-y-1">
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/unsubscribe">Unsubscribe</Link></li>
            <li><a href="/feed.xml">RSS feed</a></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
