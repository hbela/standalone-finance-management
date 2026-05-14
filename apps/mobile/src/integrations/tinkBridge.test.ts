const mockSecureStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

jest.mock("expo-crypto", () => {
  const nodeCrypto = require("crypto") as typeof import("crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    getRandomBytes: jest.fn((size: number) => new Uint8Array(size).fill(7)),
    getRandomBytesAsync: jest.fn(async (size: number) => new Uint8Array(size).fill(9)),
    digest: jest.fn(async (_algorithm: string, data: Uint8Array) => {
      const hash = nodeCrypto.createHash("sha256").update(Buffer.from(data)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    }),
  };
});

const originalFetch = global.fetch;
const originalWindow = global.window;

function loadBridge(platform: "ios" | "web" = "ios") {
  jest.resetModules();
  jest.doMock("react-native", () => ({ Platform: { OS: platform } }));
  return require("./tinkBridge") as typeof import("./tinkBridge");
}

function config(overrides: Partial<import("./tinkBridge").TinkBridgeConfig> = {}) {
  return {
    bridgeUrl: "https://bridge.example.com",
    clientId: "client-id",
    redirectUri: "https://bridge.example.com/oauth/tink/callback",
    linkBaseUrl: "https://link.tink.com/1.0/transactions/connect-accounts",
    market: "GB",
    locale: "en_US",
    scopes: ["accounts:read", "transactions:read"],
    testMode: true,
    inputProvider: "uk-demobank-open-banking-redirect",
    webRedirectUri: "",
    ...overrides,
  };
}

beforeEach(() => {
  mockSecureStore.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  jest.restoreAllMocks();
});

describe("Tink bridge token flow", () => {
  test("reports missing config and refuses to build a link", async () => {
    const bridge = loadBridge("ios");
    const missing = config({ clientId: "", bridgeUrl: "", redirectUri: "" });

    expect(bridge.isTinkBridgeConfigured(missing)).toBe(false);
    expect(bridge.getTinkBridgeMissingConfig(missing)).toEqual([
      "EXPO_PUBLIC_TINK_CLIENT_ID",
      "EXPO_PUBLIC_TINK_BRIDGE_URL",
      "EXPO_PUBLIC_TINK_REDIRECT_URI",
    ]);
    await expect(bridge.buildTinkSandboxLink(missing)).rejects.toThrow(
      /EXPO_PUBLIC_TINK_CLIENT_ID/
    );
  });

  test("builds sandbox Tink Link and stores pending state", async () => {
    const bridge = loadBridge("ios");

    const link = await bridge.buildTinkSandboxLink(config());
    const url = new URL(link);

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://link.tink.com/1.0/transactions/connect-accounts"
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example.com/oauth/tink/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("accounts:read,transactions:read");
    expect(url.searchParams.get("market")).toBe("GB");
    expect(url.searchParams.get("locale")).toBe("en_US");
    expect(url.searchParams.get("test")).toBe("true");
    expect(url.searchParams.get("input_provider")).toBe("uk-demobank-open-banking-redirect");
    expect(mockSecureStore.get("tink.sandbox.pendingState")).toBe(url.searchParams.get("state"));
  });

  test("rejects native callback when state does not match pending state", async () => {
    const bridge = loadBridge("ios");
    mockSecureStore.set("tink.sandbox.pendingState", "expected");

    await expect(
      bridge.handleTinkBridgeCallback(
        "standalone-finance://oauth/tink#state=actual&access_token=access"
      )
    ).resolves.toEqual({
      status: "failed",
      message: "Tink authorization state did not match this device.",
    });
  });

  test("stores tokens for valid native callback and handles OAuth errors", async () => {
    const bridge = loadBridge("ios");
    mockSecureStore.set("tink.sandbox.pendingState", "expected");

    const result = await bridge.handleTinkBridgeCallback(
      "standalone-finance://oauth/tink#state=expected&access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer"
    );

    expect(result).toMatchObject({
      status: "authorized",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
        tokenType: "bearer",
      },
    });
    expect(await bridge.getTinkBridgeTokens()).toMatchObject({ accessToken: "access" });
    expect(mockSecureStore.has("tink.sandbox.pendingState")).toBe(false);

    mockSecureStore.set("tink.sandbox.pendingState", "expected");
    await expect(
      bridge.handleTinkBridgeCallback(
        "standalone-finance://oauth/tink#state=expected&error=access_denied&error_description=cancelled"
      )
    ).resolves.toEqual({ status: "failed", message: "cancelled" });
  });

  test("fails callback without access token", async () => {
    const bridge = loadBridge("ios");
    mockSecureStore.set("tink.sandbox.pendingState", "expected");

    await expect(
      bridge.handleTinkBridgeCallback("standalone-finance://oauth/tink#state=expected")
    ).resolves.toEqual({
      status: "failed",
      message: "Tink authorization completed without an access token.",
    });
  });

  test("accepts current localhost web callback state without pending storage", async () => {
    const localStorage = new Map<string, string>();
    global.window = {
      location: { origin: "http://localhost:8090" },
      localStorage: {
        getItem: (key: string) => localStorage.get(key) ?? null,
        setItem: (key: string, value: string) => localStorage.set(key, value),
        removeItem: (key: string) => localStorage.delete(key),
      },
    } as unknown as Window & typeof globalThis;
    const bridge = loadBridge("web");
    const payload = Buffer.from(
      JSON.stringify({ web_redirect_uri: "http://localhost:8090/oauth/tink" })
    ).toString("base64url");

    const result = await bridge.handleTinkBridgeCallback(
      `http://localhost:8090/oauth/tink#state=nonce.${payload}&access_token=web-access`
    );

    expect(result).toMatchObject({ status: "authorized", tokens: { accessToken: "web-access" } });
    expect(localStorage.has("tink.sandbox.tokens")).toBe(true);
  });

  test("returns null for corrupt stored token JSON and clears token state", async () => {
    const bridge = loadBridge("ios");
    mockSecureStore.set("tink.sandbox.tokens", "{not-json");
    mockSecureStore.set("tink.sandbox.pendingState", "pending");

    await expect(bridge.getTinkBridgeTokens()).resolves.toBeNull();
    await bridge.clearTinkBridgeTokens();
    expect(mockSecureStore.has("tink.sandbox.tokens")).toBe(false);
    expect(mockSecureStore.has("tink.sandbox.pendingState")).toBe(false);
  });

  test("refresh signs the request and preserves old refresh token if upstream omits one", async () => {
    const bridge = loadBridge("ios");
    mockSecureStore.set(
      "tink.sandbox.tokens",
      JSON.stringify({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        tokenType: "bearer",
        expiresIn: 7200,
        scope: "accounts:read",
        receivedAt: Date.parse("2026-05-14T10:00:00Z"),
      })
    );
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const refreshed = await bridge.refreshTinkBridgeTokens(config());

    expect(refreshed).toMatchObject({
      accessToken: "new-access",
      refreshToken: "old-refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      scope: "accounts:read",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "X-Public-Key": expect.any(String),
        "X-Timestamp": expect.any(String),
        "X-Signature": expect.any(String),
      }),
      body: JSON.stringify({ refresh_token: "old-refresh" }),
    });
  });
});
