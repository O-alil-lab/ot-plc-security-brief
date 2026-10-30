import { lookup as dnsLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const systemResolver: Resolver = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

/** Only "unicast" (public) addresses are allowed. Everything else is rejected. */
export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === "ipv6") {
    const v6 = ip as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) ip = v6.toIPv4Address();
  }
  const range = ip.range();
  if (range !== "unicast") return false;
  if (ip.kind() === "ipv4") {
    // Extra explicit checks (ipaddr already classifies most of these).
    const s = ip.toString();
    if (s === "169.254.169.254" || s.startsWith("0.")) return false;
  } else {
    const v6 = ip as ipaddr.IPv6;
    // NAT64 / 6to4 / Teredo can wrap private v4 addresses.
    const first = v6.parts[0];
    if (first === 0x2002 || first === 0x2001 && v6.parts[1] === 0) return false;
    if (v6.toNormalizedString().startsWith("64:ff9b:")) return false;
    // Cloud metadata over v6 (AWS)
    if (v6.toNormalizedString() === "fd00:ec2:0:0:0:0:0:254") return false;
  }
  return true;
}

export function parseFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Scheme not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) throw new SsrfError("Credentials in URL are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new SsrfError("Missing host");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SsrfError(`Host not allowed: ${host}`);
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new SsrfError(`Port not allowed: ${url.port}`);
  }
  return url;
}

/**
 * Validate a URL and resolve its host. Returns one vetted public IP to pin
 * the connection to. Throws SsrfError if ANY resolved address is non-public
 * (defends against split responses used for DNS rebinding).
 */
export async function resolveAndValidate(
  raw: string,
  resolver: Resolver = systemResolver,
): Promise<{ url: URL; address: string; family: number }> {
  const url = parseFetchableUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new SsrfError(`Address not allowed: ${host}`);
    return { url, address: host, family: host.includes(":") ? 6 : 4 };
  }
  let records: { address: string; family: number }[];
  try {
    records = await resolver(host);
  } catch (e) {
    throw new SsrfError(`DNS lookup failed for ${host}: ${(e as Error).message}`);
  }
  if (!records.length) throw new SsrfError(`No DNS records for ${host}`);
  for (const r of records) {
    if (!isPublicIp(r.address)) throw new SsrfError(`${host} resolves to a non-public address (${r.address})`);
  }
  return { url, address: records[0].address, family: records[0].family };
}
