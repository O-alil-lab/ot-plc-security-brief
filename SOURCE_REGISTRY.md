# Source registry

Seeded in [`config/sources.ts`](config/sources.ts) via `npm run db:seed`. Re-test any time with `npm run sources:check` (live, read-only).

**Primary** sources (vendor PSIRTs, government CERTs) can support "Verified against primary source". **Secondary** sources (research, news, social, community) help discovery but are not confirmation on their own.

## Feeds

| # | Source | URL | Type | Topic | Trust level | Primary? | Last test | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | CISA ICS Advisories | https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml | RSS | ICS advisories | government_cert | Primary | 2026-10-30 | ok, 30 items |
| 2 | CISA ICS Medical Advisories | https://www.cisa.gov/cybersecurity-advisories/ics-medical-advisories.xml | RSS | ICS advisories (medical) | government_cert | Primary | 2026-10-30 | ok, 30 items |
| 3 | CISA Alerts | https://www.cisa.gov/cybersecurity-advisories/alerts.xml | RSS | Government alerts | government_cert | Primary | 2026-10-30 | ok, 30 items |
| 4 | CISA Cybersecurity Advisories | https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml | RSS | Government advisories | government_cert | Primary | 2026-10-30 | ok, 10 items |
| 5 | CERT/CC Vulnerability Notes | https://www.kb.cert.org/vuls/atomfeed/ | Atom | Vulnerability notes | government_cert | Primary | 2026-10-30 | ok, 15 items |
| 6 | Siemens ProductCERT Advisories | https://cert-portal.siemens.com/productcert/rss/advisories.atom | Atom | Vendor advisories | primary_vendor | Primary | 2026-10-30 | ok, 1,160 items |
| 7 | Siemens ProductCERT Alerts & News | https://cert-portal.siemens.com/productcert/rss/alerts.atom | Atom | Vendor alerts | primary_vendor | Primary | 2026-10-30 | ok, 29 items |
| 8 | Palo Alto Networks Advisories | https://security.paloaltonetworks.com/rss.xml | RSS | Vendor advisories (IT/OT edge) | primary_vendor | Primary | 2026-10-30 | ok, 25 items |
| 9a | CERT@VDE Advisories (Phoenix Contact, WAGO, CODESYS, Beckhoff, Pepperl+Fuchs, …) | https://certvde.com/en/advisories/feeds/rss/ | RSS | Coordinated vendor advisories | government_cert | Primary | 2026-10-31 | ok, 526 items (newest 2026-10-30) |
| 9b | Moxa Security Advisories | https://www.moxa.com/en/rss/moxa-security-advisory | RSS | Vendor advisories | primary_vendor | Primary | 2026-10-31 | ok, 207 items (newest 2026-10-27) |
| 9c | Mitsubishi Electric PSIRT | https://www.mitsubishielectric.com/psirt/vulnerability/xml/info.xml | RSS | Vendor advisories | primary_vendor | Primary | 2026-10-31 | ok, 5 items (newest 2026-10-15) |
| 9 | Fortinet PSIRT | https://filestore.fortinet.com/fortiguard/rss/ir.xml | RSS | Vendor advisories (IT/OT edge) | primary_vendor | Primary | 2026-10-30 | ok, 50 items |
| 10 | Nozomi Networks Security Alerts | https://security.nozominetworks.com/rss.xml | RSS | OT research | research | Secondary | 2026-10-30 | ok, 68 items |
| 11 | Kaspersky ICS CERT | https://ics-cert.kaspersky.com/feed/ | RSS | OT research | research | Secondary | 2026-10-30 | ok, 473 items (needed automatic XML repair) |
| 12 | Waterfall Security | https://waterfall-security.com/feed/ | RSS | OT research / commentary | research | Secondary | 2026-10-30 | ok, 10 items |
| 13 | Industrial Cyber | https://industrialcyber.co/feed/ | RSS | OT news | news | Secondary | 2026-10-30 | ok, 9 items |
| 14 | SecurityWeek | https://www.securityweek.com/feed/ | RSS | Security news | news | Secondary | 2026-10-30 | ok, 10 items |
| 15 | The Record | https://therecord.media/feed | RSS | Security news | news | Secondary | 2026-10-30 | ok, 5 items |
| 16 | The Hacker News | https://feeds.feedburner.com/TheHackersNews | RSS | Security news | news | Secondary | 2026-10-30 | ok, 50 items |
| 17 | Krebs on Security | https://krebsonsecurity.com/feed/ | RSS | Security news | news | Secondary | 2026-10-30 | ok, 10 items |

## Structured data

| Source | URL | Status in app | Last test | Result |
|---|---|---|---|---|
| CISA Known Exploited Vulnerabilities | https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json | **Implemented and tested.** Synced by the worker every 12 h and by Admin → Sources → "Sync CISA KEV". Stories with a listed CVE show a "Listed in CISA KEV" badge. | 2026-10-30 | ok, 1,766 entries (catalog 2026.10.30) |
| Siemens CSAF (TLP:WHITE) | https://cert-portal.siemens.com/productcert/csaf/ssa-feed-tlp-white.json | **Not implemented.** Reachable, but no adapter converts CSAF documents to items yet. The Siemens Atom feeds above cover the same advisories. | 2026-10-30 | ok, reachable and valid JSON |

## Test environment and known access issues

- All tests ran from a cloud build environment that reaches the internet through an egress proxy. Results from your own network can differ. Some publishers block datacenter IPs or generic user agents.
- **CISA ICS Advisories is about 6 MB** because each item embeds the full advisory. The fetch size cap is 15 MB for this reason; excerpts are still trimmed to 1,200 characters.
- **CISA blocks generic clients**: a plain `curl` got HTTP 403 while the app's fetcher (with its User-Agent) got 200. Set a descriptive `FETCH_USER_AGENT`.
- **Siemens ProductCERT Advisories carries its entire history** (about 1,160 entries back to 2019). On first fetch, items older than 30 days go to the inbox's "Older backlog" instead of the review queue.
- **Kaspersky ICS CERT** served XML with characters that needed repair (bare ampersands or control characters). The parser repaired it automatically, and the fetch run notes it.
- URLs can change. If a feed starts failing, find the publisher's current official feed **on the publisher's own site**. Don't guess replacement URLs.

## How the new feeds were found

Each new feed URL was taken from a link on the vendor's own site, then tested with the app's fetcher:

- **CERT@VDE:** the "RSS feeds" service page on certvde.com.
- **Moxa:** the RSS page linked from moxa.com's security advisory page.
- **Mitsubishi Electric:** the XML link on its PSIRT vulnerability page.

## Candidates not yet seeded

- **Schneider Electric and Rockwell Automation:** their advisory pages returned HTTP 403 to automated requests, and no official feed was found. Their ICS advisories still arrive through CISA.
- **ABB:** publishes CSAF documents (`psirt.abb.com`) but no RSS feed. Needs a CSAF adapter.
- **Honeywell, Emerson:** no official feed confirmed. Covered through CISA.
