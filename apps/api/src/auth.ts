import { getAuth } from "@clerk/fastify";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "./config.js";
import { sendNotConfigured, sendUnauthorized } from "./errors.js";

export function requireUserId(request: FastifyRequest, reply: FastifyReply) {
  if (!config.clerkPublishableKey || !config.clerkSecretKey) {
    sendNotConfigured(reply, "Clerk", `Missing ${getMissingClerkEnvNames().join(" and ")}.`);
    return null;
  }

  const auth = getAuth(request);

  if (!auth.isAuthenticated || !auth.userId) {
    sendUnauthorized(reply);
    return null;
  }

  return auth.userId;
}

function getMissingClerkEnvNames() {
  const missing = [];

  if (!config.clerkPublishableKey) {
    missing.push("CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  if (!config.clerkSecretKey) {
    missing.push("CLERK_SECRET_KEY");
  }

  return missing;
}
