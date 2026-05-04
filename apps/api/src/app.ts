import cors from "@fastify/cors";
import { clerkPlugin } from "@clerk/fastify";
import Fastify from "fastify";

import { config } from "./config.js";
import { registerBankRoutes } from "./routes/banks.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerTinkRoutes } from "./routes/tink.js";
import { registerWiseRoutes } from "./routes/wise.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin
  });

  if (config.clerkPublishableKey && config.clerkSecretKey) {
    await app.register(clerkPlugin);
  }

  await registerHealthRoutes(app);
  await registerMeRoutes(app);
  await registerBankRoutes(app);
  await registerTinkRoutes(app);
  await registerWiseRoutes(app);

  return app;
}
