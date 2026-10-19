import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADER_PATTERN = /^sha256=([0-9a-f]{64})$/;
const TIMESTAMP_PATTERN = /^(0|[1-9][0-9]{0,11})$/;
const EVENT_ID_PATTERN = /^[\x21-\x7e]{1,200}$/;

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  timestampHeader: unknown,
  eventIdHeader: unknown,
  signatureHeader: unknown,
): boolean {
  if (
    typeof timestampHeader !== "string" ||
    !TIMESTAMP_PATTERN.test(timestampHeader) ||
    typeof eventIdHeader !== "string" ||
    !EVENT_ID_PATTERN.test(eventIdHeader) ||
    typeof signatureHeader !== "string"
  ) {
    return false;
  }

  const signatureMatch = SIGNATURE_HEADER_PATTERN.exec(signatureHeader);

  if (signatureMatch === null) {
    return false;
  }

  const suppliedDigestHex = signatureMatch[1];

  if (suppliedDigestHex === undefined) {
    return false;
  }

  const signedPrefix = Buffer.from(
    `${timestampHeader}\n${eventIdHeader}\n`,
    "utf8",
  );
  const suppliedDigest = Buffer.from(suppliedDigestHex, "hex");
  const expectedDigest = createHmac("sha256", secret)
    .update(signedPrefix)
    .update(rawBody)
    .digest();

  if (suppliedDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(suppliedDigest, expectedDigest);
}