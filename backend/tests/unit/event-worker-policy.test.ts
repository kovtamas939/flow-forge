import { describe, expect, it } from "vitest";
import {
  hasExhaustedRetries,
  isRetryableError,
} from "../../src/queue/event-worker.js";
import { HttpActionError } from "../../src/workflows/actions/http-request-adapter.js";

describe("event worker retry policy", () => {
  describe("isRetryableError", () => {
    it("uses the HTTP action's retryable classification", () => {
      expect(
        isRetryableError(
          new HttpActionError(
            "HTTP_REMOTE_SERVER_ERROR",
            "Remote server failed",
            true,
          ),
        ),
      ).toBe(true);

      expect(
        isRetryableError(
          new HttpActionError(
            "HTTP_REMOTE_CLIENT_ERROR",
            "Remote server rejected the request",
            false,
          ),
        ),
      ).toBe(false);
    });

    it("retries errors explicitly marked retryable", () => {
      const error = Object.assign(new Error("Temporary failure"), {
        retryable: true,
      });

      expect(isRetryableError(error)).toBe(true);
    });

    it("retries transient PostgreSQL and network errors", () => {
      const postgresError = Object.assign(
        new Error("Serialization failure"),
        { code: "40001" },
      );
      const connectionError = Object.assign(
        new Error("Connection failed"),
        { code: "08006" },
      );
      const networkError = Object.assign(
        new Error("Connection timed out"),
        { code: "ETIMEDOUT" },
      );

      expect(isRetryableError(postgresError)).toBe(true);
      expect(isRetryableError(connectionError)).toBe(true);
      expect(isRetryableError(networkError)).toBe(true);
    });

    it("does not retry permanent or unknown errors", () => {
      const constraintError = Object.assign(
        new Error("Unique constraint violation"),
        { code: "23505" },
      );

      expect(isRetryableError(constraintError)).toBe(false);
      expect(isRetryableError(new Error("Unexpected failure"))).toBe(false);
      expect(isRetryableError("not an Error object")).toBe(false);
    });
  });

  describe("hasExhaustedRetries", () => {
    it("recognizes the final configured attempt", () => {
      expect(
        hasExhaustedRetries({
          attemptsMade: 3,
          opts: { attempts: 5 },
        }),
      ).toBe(false);

      expect(
        hasExhaustedRetries({
          attemptsMade: 4,
          opts: { attempts: 5 },
        }),
      ).toBe(true);
    });

    it("returns false when no positive attempt limit is configured", () => {
      expect(
        hasExhaustedRetries({
          attemptsMade: 10,
          opts: {},
        }),
      ).toBe(false);

      expect(
        hasExhaustedRetries({
          attemptsMade: 10,
          opts: { attempts: 0 },
        }),
      ).toBe(false);
    });
  });
});