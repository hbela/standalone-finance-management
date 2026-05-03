import type { FastifyInstance } from "fastify";
import { API_SERVICE_NAME, type HealthResponse } from "@wise-finance/shared";

import { config } from "../config.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async (): Promise<HealthResponse> => ({
    service: API_SERVICE_NAME,
    status: "ok"
  }));

  app.get("/config", async () => ({
    service: API_SERVICE_NAME,
    wiseEnvironment: config.wiseEnvironment,
    clerkConfigured: Boolean(config.clerkPublishableKey && config.clerkSecretKey),
    convexConfigured: Boolean(config.convexUrl),
    wiseConfigured: Boolean(config.wiseClientId)
  }));
}
