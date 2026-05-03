import { getAuth } from "@clerk/fastify";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "./config.js";
import { sendNotConfigured, sendUnauthorized } from "./errors.js";

export function requireUserId(request: FastifyRequest, reply: FastifyReply) {
  if (!config.clerkPublishableKey || !config.clerkSecretKey) {
    sendNotConfigured(reply, "Clerk");
    return null;
  }

  const auth = getAuth(request);

  if (!auth.isAuthenticated || !auth.userId) {
    sendUnauthorized(reply);
    return null;
  }

  return auth.userId;
}
