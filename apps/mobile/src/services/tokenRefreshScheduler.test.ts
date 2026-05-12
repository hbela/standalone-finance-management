import { decideNextRefresh, DEFAULT_REFRESH_LEAD_SECONDS } from "./tokenRefreshScheduler";

const NOW = Date.parse("2026-05-12T10:00:00.000Z");

function tokens(overrides: {
  accessToken?: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
  receivedAt?: number;
} = {}) {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresIn: 7200,
    receivedAt: NOW,
    ...overrides,
  };
}

describe("decideNextRefresh", () => {
  test("returns no-refresh-token when tokens are missing", () => {
    expect(decideNextRefresh(null, NOW)).toEqual({ kind: "no-refresh-token" });
  });

  test("returns no-refresh-token when the refresh token is absent", () => {
    expect(decideNextRefresh(tokens({ refreshToken: undefined }), NOW)).toEqual({
      kind: "no-refresh-token",
    });
  });

  test("returns no-refresh-token when expiresIn is missing or zero", () => {
    expect(decideNextRefresh(tokens({ expiresIn: undefined }), NOW)).toEqual({
      kind: "no-refresh-token",
    });
    expect(decideNextRefresh(tokens({ expiresIn: 0 }), NOW)).toEqual({
      kind: "no-refresh-token",
    });
  });

  test("schedules at expiresIn minus the lead window when refresh is in the future", () => {
    // expiresIn=7200s (2h), lead=60s -> trigger at receivedAt + 2h - 60s = +7140s from receivedAt
    const decision = decideNextRefresh(tokens(), NOW);
    expect(decision).toEqual({ kind: "schedule", delayMs: 7140 * 1000 });
  });

  test("respects a custom lead window", () => {
    const decision = decideNextRefresh(tokens(), NOW, 300);
    expect(decision).toEqual({ kind: "schedule", delayMs: 6900 * 1000 });
  });

  test("refreshes now when inside the lead window", () => {
    // Token expires in 30s, lead is 60s -> we're already past the trigger time.
    const decision = decideNextRefresh(
      tokens({ receivedAt: NOW - 7170 * 1000, expiresIn: 7200 }),
      NOW
    );
    expect(decision).toEqual({ kind: "refresh-now" });
  });

  test("refreshes now when the access token is already expired", () => {
    const decision = decideNextRefresh(
      tokens({ receivedAt: NOW - 10_000 * 1000, expiresIn: 7200 }),
      NOW
    );
    expect(decision).toEqual({ kind: "refresh-now" });
  });

  test("clamps a very long delay to the 6-hour safety ceiling", () => {
    // expiresIn=48h, refresh would be scheduled ~48h-60s out, but we cap at 6h
    // so the next foreground/timer re-tick still happens within a sane window.
    const decision = decideNextRefresh(
      tokens({ expiresIn: 48 * 3600 }),
      NOW
    );
    expect(decision.kind).toBe("schedule");
    if (decision.kind === "schedule") {
      expect(decision.delayMs).toBe(6 * 60 * 60 * 1000);
    }
  });

  test("DEFAULT_REFRESH_LEAD_SECONDS exposes the 60-second default", () => {
    expect(DEFAULT_REFRESH_LEAD_SECONDS).toBe(60);
  });
});
