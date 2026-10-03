import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  generateRequestId,
  registerRequestIdHook,
  REQUEST_ID_HEADER,
} from "./request-id.js";
import { registerRoutes } from "./routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: "info",
    },
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: generateRequestId,
  });

  registerRequestIdHook(app);
  await app.register(registerRoutes);
  return app;
}