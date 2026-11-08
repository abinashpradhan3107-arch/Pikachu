import { lookup } from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4 = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10],
  ["198.18.0.0", 15],
] as const;

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  return PRIVATE_V4.some(([range, bits]) => {
    const base = ipv4ToNumber(range);
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice(7);
      if (net.isIPv4(v4)) return isPrivateIpv4(v4);
    }
  }
  return false;
}

/**
 * Blocks SSRF attempts for user-supplied server-side URLs. We only allow
 * public http(s) hosts; localhost is permitted in development for testing.
 */
export async function assertSafeRemoteUrl(
  input: string,
  options: { allowHttpLocalhost?: boolean } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  const isLocalhost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";

  if (url.protocol !== "https:") {
    if (!(options.allowHttpLocalhost && isLocalhost && url.protocol === "http:")) {
      throw new Error("Only HTTPS URLs are allowed.");
    }
  }

  if (isLocalhost) {
    if (!options.allowHttpLocalhost) {
      throw new Error("Local network URLs are not allowed.");
    }
    return url;
  }

  let addresses: { address: string }[] = [];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new Error("Could not resolve that hostname.");
  }

  if (!addresses.length) {
    throw new Error("Could not resolve that hostname.");
  }

  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("That URL points to a private network address.");
  }

  return url;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
