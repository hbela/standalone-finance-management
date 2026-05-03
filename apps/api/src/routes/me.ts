import type { FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";

export async function registerMeRoutes(app: FastifyInstance) {
  app.get("/me", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    return {
      clerkUserId: userId
    };
  });
}
