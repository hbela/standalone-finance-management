import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { config } from "./config.js";

export const convexApi = anyApi;

export function getConvexClient() {
  if (!config.convexUrl || !config.apiServiceSecret) {
    return null;
  }

  return new ConvexHttpClient(config.convexUrl);
}

