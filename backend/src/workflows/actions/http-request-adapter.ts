import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import type { WorkflowAction } from "../workflow-definition.js";
import {
  resolveSafeHttpRequestTarget,
  type SafeHttpRequestTarget,
} from "./http-request-security.js";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BODY_BYTES = 64 * 1024;

export type HttpRequestDelivery = {
  executionId: string;
  stepId: string;
  action: Extract<WorkflowAction, { type: "http_request" }>;
};

export type HttpRequestOutcome = {
  statusCode: number;
};

export class HttpActionError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "HttpActionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface HttpRequestAdapter {
  execute(delivery: HttpRequestDelivery): Promise<HttpRequestOutcome>;
}

function createPinnedLookup(target: SafeHttpRequestTarget): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [
        {
          address: target.address,
          family: target.family,
        },
      ]);
      return;
    }

    callback(null, target.address, target.family);
  };
}

function createBodyTooLargeError(bodyType: "request" | "response"): HttpActionError {
  return new HttpActionError(
    `HTTP_${bodyType.toUpperCase()}_BODY_TOO_LARGE`,
    `The HTTP action ${bodyType} body exceeds the configured size limit`,
    false,
  );
}

function sendHttpRequest(
  target: SafeHttpRequestTarget,
  action: HttpRequestDelivery["action"],
  requestBody: Buffer | undefined,
): Promise<HttpRequestOutcome> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBodyBytes = 0;

    const finish = (
      error: Error | undefined,
      outcome: HttpRequestOutcome | undefined,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (error !== undefined) {
        reject(error);
        return;
      }

      if (outcome === undefined) {
        reject(
          new HttpActionError(
            "HTTP_REQUEST_FAILED",
            "The HTTP action did not produce a response",
            true,
          ),
        );
        return;
      }

      resolve(outcome);
    };

    const requestOptions = {
      method: action.method,
      lookup: createPinnedLookup(target),
    };

    const request =
      target.url.protocol === "https:"
        ? httpsRequest(target.url, requestOptions)
        : httpRequest(target.url, requestOptions);

    const timeout = setTimeout(() => {
      const timeoutError = new HttpActionError(
        "HTTP_REQUEST_TIMEOUT",
        "The HTTP action exceeded its 5 second timeout",
        true,
      );

      finish(timeoutError, undefined);
      request.destroy(timeoutError);
    }, REQUEST_TIMEOUT_MS);

    request.on("response", (response) => {
      const statusCode = response.statusCode;

      if (statusCode === undefined) {
        response.resume();
        finish(
          new HttpActionError(
            "HTTP_RESPONSE_STATUS_MISSING",
            "The HTTP action response did not include a status code",
            true,
          ),
          undefined,
        );
        return;
      }

      response.on("data", (chunk: Buffer | string) => {
        responseBodyBytes += Buffer.byteLength(chunk);

        if (responseBodyBytes > MAX_RESPONSE_BODY_BYTES) {
          const bodyTooLargeError = createBodyTooLargeError("response");
          finish(bodyTooLargeError, undefined);
          response.destroy(bodyTooLargeError);
          request.destroy(bodyTooLargeError);
        }
      });

      response.on("end", () => {
        if (statusCode >= 200 && statusCode < 300) {
          finish(undefined, { statusCode });
          return;
        }

        if (statusCode >= 500) {
          finish(
            new HttpActionError(
              "HTTP_REMOTE_SERVER_ERROR",
              "The HTTP action destination returned a server error",
              true,
            ),
            undefined,
          );
          return;
        }

        finish(
          new HttpActionError(
            statusCode >= 300 && statusCode < 400
              ? "HTTP_REDIRECT_NOT_ALLOWED"
              : "HTTP_REMOTE_CLIENT_ERROR",
            "The HTTP action destination returned a non-success status",
            false,
          ),
          undefined,
        );
      });

      response.on("error", (error: Error) => {
        finish(
          new HttpActionError(
            "HTTP_RESPONSE_READ_FAILED",
            "The HTTP action response could not be read",
            true,
          ),
          undefined,
        );
        request.destroy(error);
      });
    });

    request.on("error", (error: Error) => {
      if (error instanceof HttpActionError) {
        finish(error, undefined);
        return;
      }

      finish(
        new HttpActionError(
          "HTTP_NETWORK_ERROR",
          "The HTTP action could not reach its destination",
          true,
        ),
        undefined,
      );
    });

    request.on("close", () => {
      if (!settled && !request.writableEnded) {
        finish(
          new HttpActionError(
            "HTTP_CONNECTION_CLOSED",
            "The HTTP action connection closed before the request completed",
            true,
          ),
          undefined,
        );
      }
    });

    if (requestBody !== undefined) {
      request.setHeader("content-type", "application/json");
      request.setHeader("content-length", requestBody.byteLength);
      request.end(requestBody);
      return;
    }

    request.end();
  });
}

export function createHttpRequestAdapter(): HttpRequestAdapter {
  return {
    async execute(delivery) {
      const requestBody =
        delivery.action.body === undefined
          ? undefined
          : Buffer.from(JSON.stringify(delivery.action.body), "utf8");

      if (
        requestBody !== undefined &&
        requestBody.byteLength > MAX_REQUEST_BODY_BYTES
      ) {
        throw createBodyTooLargeError("request");
      }

      let target: SafeHttpRequestTarget;

      try {
        target = await resolveSafeHttpRequestTarget(delivery.action.url);
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          throw new HttpActionError(
            String(error.code),
            error.message,
            false,
          );
        }

        throw new HttpActionError(
          "HTTP_DESTINATION_VALIDATION_FAILED",
          "The HTTP action destination could not be validated",
          false,
        );
      }

      return sendHttpRequest(target, delivery.action, requestBody);
    },
  };
}