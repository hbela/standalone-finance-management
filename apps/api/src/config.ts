import "dotenv/config";

export type WiseEnvironment = "sandbox" | "production";

export type ApiConfig = {
  host: string;
  port: number;
  corsOrigin: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  wiseEnvironment: WiseEnvironment;
  wiseApiBaseUrl: string;
  wiseClientId?: string;
  convexUrl?: string;
};

const wiseEnvironment = (process.env.WISE_ENVIRONMENT ?? "sandbox") as WiseEnvironment;

export const config: ApiConfig = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  wiseEnvironment,
  wiseApiBaseUrl:
    process.env.WISE_API_BASE_URL ??
    (wiseEnvironment === "production"
      ? "https://api.wise.com"
      : "https://api.sandbox.transferwise.tech"),
  wiseClientId: process.env.WISE_CLIENT_ID,
  convexUrl: process.env.CONVEX_URL
};
