import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import * as http from 'node:http';
import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { badRequest } from './errors';

/**
 * Shared SSRF guard (research.md §4, FR-013). Gates EVERY outbound URL the
 * downloads feature controls — the submitted URL, discovered media/manifest
 * URLs, and every redirect hop. Allows only http/https, resolves the host via
 * DNS, and rejects loopback/private(RFC1918)/link-local/unique-local/CGNAT/
 * reserved/multicast/self-interface addresses. Rejections are generic — no
 * internal detail (which check failed, resolved IP, etc.) is ever leaked.
 *
 * `downloadAllowPrivateAddresses` is an explicit, off-by-default opt-out for a
 * self-hoster who deliberately wants to reach their own LAN.
 */

export interface UrlGuardConfig {
  downloadAllowPrivateAddresses: boolean;
}

const GENERIC_REJECTION = 'URL not allowed';
const MAX_REDIRECTS = 5;

function rejected(): never {
  throw badRequest(GENERIC_REJECTION);
}

/** True for loopback/RFC1918/link-local/CGNAT/reserved/multicast IPv4. */
function isDisallowedIPv4(address: string): boolean {
  const parts = address.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed => refuse
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

/** True for loopback/link-local/unique-local/multicast IPv6 (incl. mapped IPv4). */
function isDisallowedIPv6(address: string): boolean {
  const addr = address.toLowerCase();
  if (addr === '::1' || addr === '::') return true;
  if (addr.startsWith('fe80:')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local fc00::/7
  if (addr.startsWith('ff')) return true; // multicast
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isDisallowedIPv4(mapped[1] as string);
  return false;
}

function isDisallowedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isDisallowedIPv4(address);
  if (family === 6) return isDisallowedIPv6(address);
  return true; // not a recognizable literal address => refuse
}

function selfAddresses(): Set<string> {
  const set = new Set<string>();
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) set.add(iface.address);
  }
  return set;
}

interface ResolvedAddress {
  address: string;
  family: number;
}

async function resolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const literal = isIP(hostname);
  if (literal) return [{ address: hostname, family: literal }];
  try {
    const addrs = await dnsLookup(hostname, { all: true });
    return addrs;
  } catch {
    rejected();
  }
}

export interface ValidatedUrl {
  url: URL;
  address: string;
  family: number;
}

/**
 * Validate a single URL: http(s) only, resolves via DNS, and every candidate
 * address is public (unless explicitly opted out). Returns the parsed URL and
 * the address to connect to (pinned, so a later re-resolution can't differ —
 * defeats basic DNS rebinding). Throws a generic 400 otherwise.
 */
export async function assertUrlAllowed(rawUrl: string, config: UrlGuardConfig): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rejected();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') rejected();
  if (!url.hostname) rejected();

  const addresses = await resolveHost(url.hostname);
  if (addresses.length === 0) rejected();

  if (!config.downloadAllowPrivateAddresses) {
    const self = selfAddresses();
    for (const a of addresses) {
      if (isDisallowedAddress(a.address) || self.has(a.address)) rejected();
    }
  }

  const first = addresses[0] as ResolvedAddress;
  return { url, address: first.address, family: first.family };
}

/**
 * A fetch that re-validates the SSRF guard at every redirect hop and connects
 * to the exact address it validated (via a pinned `lookup`), never letting a
 * second DNS query pick a different (possibly internal) address.
 */
export function guardedFetch(
  rawUrl: string,
  config: UrlGuardConfig,
  init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<IncomingMessage & { finalUrl: string }> {
  return followRedirects(rawUrl, config, init, 0);
}

async function followRedirects(
  currentUrl: string,
  config: UrlGuardConfig,
  init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
  hop: number,
): Promise<IncomingMessage & { finalUrl: string }> {
  if (hop > MAX_REDIRECTS) rejected();
  const { url, address } = await assertUrlAllowed(currentUrl, config);
  const mod = url.protocol === 'https:' ? https : http;
  const addressFamily = isIP(address);

  const res = await new Promise<IncomingMessage>((resolvePromise, reject) => {
    const req = mod.request(
      url,
      {
        method: init.method ?? 'GET',
        headers: { ...init.headers, Host: url.host },
        signal: init.signal,
        // Pin the connection to the address we just validated (no second DNS query).
        lookup: (_hostname: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
          cb(null, address, addressFamily === 6 ? 6 : 4);
        },
      },
      resolvePromise,
    );
    req.on('error', reject);
    req.end();
  });

  const status = res.statusCode ?? 0;
  if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
    res.resume(); // discard body, follow the redirect
    const next = new URL(res.headers.location, url).toString();
    return followRedirects(next, config, init, hop + 1);
  }

  return Object.assign(res, { finalUrl: url.toString() });
}
