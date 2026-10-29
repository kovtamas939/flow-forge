import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { pingPool } from "../../db/pool.js";

type HealthRoutesOptions = {
  pool: Pool;
};

type HealthResponse = {
  status: "ok";
};

type ReadyResponse = {
  status: "ready";
  dependencies: {
    postgres: "ok";
  };
};

type NotReadyResponse = {
  status: "not_ready";
  dependencies: {
    postgres: "unavailable";
  };
};

export async function healthRoutes(
  app: FastifyInstance,
  options: HealthRoutesOptions,
): Promise<void> {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: {
              status: { type: "string", const: "ok" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const body: HealthResponse = { status: "ok" };
      return reply.code(200).send(body);
    },
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status", "dependencies"],
            properties: {
              status: { type: "string", const: "ready" },
              dependencies: {
                type: "object",
                additionalProperties: false,
                required: ["postgres"],
                properties: {
                  postgres: { type: "string", const: "ok" },
                },
              },
            },
          },
          503: {
            type: "object",
            additionalProperties: false,
            required: ["status", "dependencies"],
            properties: {
              status: { type: "string", const: "not_ready" },
              dependencies: {
                type: "object",
                additionalProperties: false,
                required: ["postgres"],
                properties: {
                  postgres: { type: "string", const: "unavailable" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await pingPool(options.pool);

        const body: ReadyResponse = {
          status: "ready",
          dependencies: {
            postgres: "ok",
          },
        };

        return reply.code(200).send(body);
      } catch {
        request.log.warn(
          {
            requestId: request.id,
            dependency: "postgres",
          },
          "Readiness check failed",
        );

        const body: NotReadyResponse = {
          status: "not_ready",
          dependencies: {
            postgres: "unavailable",
          },
        };

        return reply.code(503).send(body);
      }
    },
  );
}