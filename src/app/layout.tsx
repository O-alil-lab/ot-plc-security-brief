import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from this app,
// so no external font requests happen at runtime.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexCondensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plex-condensed", display: "swap" });

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "OT & PLC Security Brief", template: "%s | OT & PLC Security Brief" },
  description:
    "A concise, verified briefing on PLC, OT, ICS and industrial cybersecurity: affected products, why they matter, and links to original sources.",
  openGraph: { type: "website", siteName: "OT & PLC Security Brief" },
  alternates: { types: { "application/rss+xml": `${baseUrl}/feed.xml` } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
