export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const TIMESTAMP_PATTERN = /^(0|[1-9][0-9]{0,11})$/;

export function isWebhookTimestampFresh(
  timestampHeader: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (
    typeof timestampHeader !== "string" ||
    !TIMESTAMP_PATTERN.test(timestampHeader)
  ) {
    return false;
  }

  const timestampSeconds = Number(timestampHeader);

  if (!Number.isSafeInteger(timestampSeconds)) {
    return false;
  }

  return (
    Math.abs(nowSeconds - timestampSeconds) <=
    WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
  );
}