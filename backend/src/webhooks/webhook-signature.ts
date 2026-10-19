import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADER_PATTERN = /^sha256=([0-9a-f]{64})$/;

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: unknown,
): boolean {
  if (typeof signatureHeader !== "string") {
    return false;
  }

  const match = SIGNATURE_HEADER_PATTERN.exec(signatureHeader);

  if (match === null) {
    return false;
  }

  const suppliedDigestHex = match[1];

  if (suppliedDigestHex === undefined) {
    return false;
  }

  const suppliedDigest = Buffer.from(suppliedDigestHex, "hex");
  const expectedDigest = createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  if (suppliedDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(suppliedDigest, expectedDigest);
}