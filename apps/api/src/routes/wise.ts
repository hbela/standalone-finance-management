import type { FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";
import { config } from "../config.js";
import { sendNotConfigured } from "../errors.js";

export async function registerWiseRoutes(app: FastifyInstance) {
  app.get("/wise/status", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    return {
      connected: false,
      environment: config.wiseEnvironment,
      apiBaseUrl: config.wiseApiBaseUrl
    };
  });

  app.get("/wise/profiles", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.wiseClientId) {
      return sendNotConfigured(reply, "Wise");
    }

    return reply.code(501).send({
      error: "not_implemented",
      message: "Wise OAuth/token storage is the next backend step."
    });
  });
}
