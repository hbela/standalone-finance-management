import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export type WiseEnvironment = "sandbox" | "production";
export type SupportedCountry = "HU" | "FR" | "GB";

export type ApiConfig = {
  host: string;
  port: number;
  corsOrigin: string;
  appRedirectUrl: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  wiseEnvironment: WiseEnvironment;
  wiseApiBaseUrl: string;
  wiseClientId?: string;
  convexUrl?: string;
  apiServiceSecret?: string;
  tokenVaultDir: string;
  tokenEncryptionKey?: string;
  tinkClientId?: string;
  tinkClientSecret?: string;
  tinkApiBaseUrl: string;
  tinkLinkBaseUrl: string;
  tinkRedirectUri?: string;
  tinkMarket: SupportedCountry;
  tinkLocale: string;
  tinkScopes: string[];
  tinkTestMode: boolean;
  tinkInputProvider?: string;
  tinkInputUsername?: string;
  tinkUseInputPrefill: boolean;
  tinkUseExistingUser: boolean;
  tinkLinkAuthMode: "code" | "token";
  oauthStateSecret?: string;
};

const wiseEnvironment = (process.env.WISE_ENVIRONMENT ?? "sandbox") as WiseEnvironment;

loadLocalEnv();

export const config: ApiConfig = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  appRedirectUrl: process.env.APP_REDIRECT_URL ?? "wise-finance://",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  wiseEnvironment,
  wiseApiBaseUrl:
    process.env.WISE_API_BASE_URL ??
    (wiseEnvironment === "production"
      ? "https://api.wise.com"
      : "https://api.sandbox.transferwise.tech"),
  wiseClientId: process.env.WISE_CLIENT_ID,
  convexUrl: process.env.CONVEX_URL,
  apiServiceSecret: process.env.API_SERVICE_SECRET,
  tokenVaultDir: process.env.TOKEN_VAULT_DIR ?? ".token-vault",
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
  tinkClientId: process.env.TINK_CLIENT_ID,
  tinkClientSecret: process.env.TINK_CLIENT_SECRET,
  tinkApiBaseUrl: process.env.TINK_API_BASE_URL ?? "https://api.tink.com",
  tinkLinkBaseUrl:
    process.env.TINK_LINK_BASE_URL ??
    "https://link.tink.com/1.0/transactions/connect-accounts",
  tinkRedirectUri: process.env.TINK_REDIRECT_URI,
  tinkMarket: parseSupportedCountry(process.env.TINK_MARKET),
  tinkLocale: process.env.TINK_LOCALE ?? "en_US",
  tinkScopes: (
    process.env.TINK_SCOPES ??
    "accounts:read,balances:read,transactions:read,provider-consents:read,user:read,credentials:read,credentials:refresh"
  )
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean),
  tinkTestMode: process.env.TINK_TEST_MODE === "true",
  tinkInputProvider: process.env.TINK_INPUT_PROVIDER,
  tinkInputUsername: process.env.TINK_INPUT_USERNAME,
  tinkUseInputPrefill: process.env.TINK_USE_INPUT_PREFILL !== "false",
  tinkUseExistingUser: process.env.TINK_USE_EXISTING_USER === "true",
  tinkLinkAuthMode: process.env.TINK_LINK_AUTH_MODE === "token" ? "token" : "code",
  oauthStateSecret: process.env.OAUTH_STATE_SECRET
};

function loadLocalEnv() {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(apiRoot, "..", "..");

  for (const envPath of [
    resolve(apiRoot, ".env.local"),
    resolve(apiRoot, ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env")
  ]) {
    if (!existsSync(envPath)) {
      continue;
    }

    const parsed = parse(readFileSync(envPath));

    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] ??= value;
    }
  }
}

function parseSupportedCountry(value: string | undefined): SupportedCountry {
  if (value === "GB") {
    return "GB";
  }

  if (value === "FR") {
    return "FR";
  }

  return "HU";
}
