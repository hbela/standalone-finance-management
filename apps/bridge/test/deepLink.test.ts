import { describe, expect, it } from "vitest";
import {
  buildOAuthDeepLink,
  buildOAuthErrorDeepLink,
  buildOAuthWebRedirect,
} from "../src/lib/deepLink.js";

describe("deepLink", () => {
  it("builds a tink success deep link with all token fields in the fragment", () => {
    const link = buildOAuthDeepLink({
      scheme: "standalone-finance",
      provider: "tink",
      state: "abc123",
      payload: {
        access_token: "tok-access",
        refresh_token: "tok-refresh",
        expires_in: 3600,
        scope: "accounts:read,balances:read",
        token_type: "bearer",
      },
    });

    expect(link.startsWith("standalone-finance://oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(link.split("#")[1]);
    expect(fragment.get("state")).toBe("abc123");
    expect(fragment.get("access_token")).toBe("tok-access");
    expect(fragment.get("refresh_token")).toBe("tok-refresh");
    expect(fragment.get("expires_in")).toBe("3600");
    expect(fragment.get("scope")).toBe("accounts:read,balances:read");
    expect(fragment.get("token_type")).toBe("bearer");
  });

  it("omits optional token fields when not provided", () => {
    const link = buildOAuthDeepLink({
      scheme: "standalone-finance",
      provider: "tink",
      state: "s",
      payload: { access_token: "only-access" },
    });

    const fragment = new URLSearchParams(link.split("#")[1]);
    expect(fragment.get("access_token")).toBe("only-access");
    expect(fragment.has("refresh_token")).toBe(false);
    expect(fragment.has("expires_in")).toBe(false);
  });

  it("builds a web callback redirect with token fields in the fragment", () => {
    const link = buildOAuthWebRedirect({
      returnUrl: "http://localhost:8091/oauth/tink",
      provider: "tink",
      state: "abc123",
      payload: {
        access_token: "tok-access",
        refresh_token: "tok-refresh",
      },
    });

    expect(link.startsWith("http://localhost:8091/oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(link.split("#")[1]);
    expect(fragment.get("state")).toBe("abc123");
    expect(fragment.get("access_token")).toBe("tok-access");
    expect(fragment.get("refresh_token")).toBe("tok-refresh");
  });

  it("builds an error deep link preserving state", () => {
    const link = buildOAuthErrorDeepLink({
      scheme: "standalone-finance",
      provider: "tink",
      state: "s1",
      error: "access_denied",
      errorDescription: "User cancelled bank login",
    });

    expect(link).toBe(
      "standalone-finance://oauth/tink#state=s1&error=access_denied&error_description=User+cancelled+bank+login"
    );
  });

  it("builds an error deep link without state when none was supplied", () => {
    const link = buildOAuthErrorDeepLink({
      scheme: "standalone-finance",
      provider: "tink",
      state: null,
      error: "invalid_request",
    });

    expect(link).toBe("standalone-finance://oauth/tink#error=invalid_request");
  });
});
