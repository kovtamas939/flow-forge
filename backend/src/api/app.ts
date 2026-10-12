import fastifyCookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  generateRequestId,
  registerRequestIdHook,
  REQUEST_ID_HEADER,
} from "./request-id.js";
import { registerRoutes } from "./routes.js";

export async function buildApp(
  pool: Pool,
  secureCookies: boolean,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: "info",
    },
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: generateRequestId,
  });

  await app.register(fastifyCookie);
  app.decorateRequest("currentUser", null);

  registerRequestIdHook(app);
  await app.register(registerRoutes, { pool, secureCookies });

  return app;
}