import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const BLOCKED_IPV4_SUBNETS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const BLOCKED_IPV6_SUBNETS = [
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

const blockedIpv4Addresses = new BlockList();

for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedIpv4Addresses.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6Addresses = new BlockList();

for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

const globalUnicastIpv6Addresses = new BlockList();
globalUnicastIpv6Addresses.addSubnet("2000::", 3, "ipv6");

export class HttpRequestPolicyError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "HttpRequestPolicyError";
    this.code = code;
  }
}

export type SafeHttpRequestTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

function getUrlHostname(url: URL): string {
  if (url.hostname.startsWith("[") && url.hostname.endsWith("]")) {
    return url.hostname.slice(1, -1);
  }

  return url.hostname;
}

function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) {
    return (
      isIP(address) === 4 &&
      !blockedIpv4Addresses.check(address, "ipv4")
    );
  }

  if (family === 6) {
    return (
      isIP(address) === 6 &&
      globalUnicastIpv6Addresses.check(address, "ipv6") &&
      !blockedIpv6Addresses.check(address, "ipv6")
    );
  }

  return false;
}

export async function resolveSafeHttpRequestTarget(
  rawUrl: string,
): Promise<SafeHttpRequestTarget> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpRequestPolicyError(
      "HTTP_URL_INVALID",
      "The HTTP action URL is invalid",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpRequestPolicyError(
      "HTTP_URL_PROTOCOL_NOT_ALLOWED",
      "The HTTP action URL must use HTTP or HTTPS",
    );
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new HttpRequestPolicyError(
      "HTTP_URL_CREDENTIALS_NOT_ALLOWED",
      "Credentials in the HTTP action URL are not allowed",
    );
  }

  const hostname = getUrlHostname(url);

  if (hostname.length === 0) {
    throw new HttpRequestPolicyError(
      "HTTP_URL_HOST_REQUIRED",
      "The HTTP action URL must include a hostname",
    );
  }

  const literalIpFamily = isIP(hostname);
  const addresses =
    literalIpFamily === 4 || literalIpFamily === 6
      ? [{ address: hostname, family: literalIpFamily }]
      : await lookup(hostname, {
          all: true,
          order: "verbatim",
        });

  if (addresses.length === 0) {
    throw new HttpRequestPolicyError(
      "HTTP_DESTINATION_UNRESOLVABLE",
      "The HTTP action hostname did not resolve to an IP address",
    );
  }

  for (const address of addresses) {
    if (!isPublicAddress(address.address, address.family)) {
      throw new HttpRequestPolicyError(
        "HTTP_DESTINATION_NOT_PUBLIC",
        "The HTTP action destination must resolve only to public IP addresses",
      );
    }
  }

  const selectedAddress = addresses[0];

  if (selectedAddress === undefined) {
    throw new HttpRequestPolicyError(
      "HTTP_DESTINATION_UNRESOLVABLE",
      "The HTTP action hostname did not resolve to an IP address",
    );
  }

  if (selectedAddress.family !== 4 && selectedAddress.family !== 6) {
  throw new HttpRequestPolicyError(
    "HTTP_DESTINATION_UNRESOLVABLE",
    "The HTTP action hostname did not resolve to an IP address",
  );
}

  return {
    url,
    address: selectedAddress.address,
    family: selectedAddress.family,
  };
}