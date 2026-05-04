import "dotenv/config";

export type WiseEnvironment = "sandbox" | "production";
export type SupportedCountry = "HU" | "FR";

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
  tinkScopes: string[];
  oauthStateSecret?: string;
};

const wiseEnvironment = (process.env.WISE_ENVIRONMENT ?? "sandbox") as WiseEnvironment;

export const config: ApiConfig = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  appRedirectUrl: process.env.APP_REDIRECT_URL ?? "wise-finance://",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
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
  tinkLinkBaseUrl: process.env.TINK_LINK_BASE_URL ?? "https://link.tink.com/1.0/authorize",
  tinkRedirectUri: process.env.TINK_REDIRECT_URI,
  tinkMarket: parseSupportedCountry(process.env.TINK_MARKET),
  tinkScopes: (
    process.env.TINK_SCOPES ??
    "accounts:read,balances:read,transactions:read,provider-consents:read"
  )
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean),
  oauthStateSecret: process.env.OAUTH_STATE_SECRET
};

function parseSupportedCountry(value: string | undefined): SupportedCountry {
  if (value === "FR") {
    return "FR";
  }

  return "HU";
}
