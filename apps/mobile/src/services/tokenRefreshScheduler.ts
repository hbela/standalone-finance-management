import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  getTinkBridgeTokens,
  refreshTinkBridgeTokens,
  type TinkBridgeTokens,
} from "../integrations/tinkBridge";

/**
 * Default lead time: fire the refresh ~60s before the access token expires so a
 * slow network round-trip can't slip past expiry.
 */
export const DEFAULT_REFRESH_LEAD_SECONDS = 60;

/**
 * Cap a single setTimeout delay. JS allows ~24.8 days but if expiresIn is ever
 * absurdly large we'd rather re-tick on the next foreground than hold a stale
 * pending timer.
 */
const MAX_SCHEDULE_DELAY_MS = 6 * 60 * 60 * 1000;

export type RefreshDecision =
  | { kind: "no-refresh-token" }
  | { kind: "refresh-now" }
  | { kind: "schedule"; delayMs: number };

/**
 * Pure decision function for whether/when to refresh. Returns:
 *   - "no-refresh-token" when no refresh token is stored or expiry is unknown,
 *   - "refresh-now" when we're already inside the lead window (or past expiry),
 *   - "schedule" with the millisecond delay when a future refresh should fire.
 */
export function decideNextRefresh(
  tokens: TinkBridgeTokens | null,
  nowMs: number,
  leadSeconds: number = DEFAULT_REFRESH_LEAD_SECONDS
): RefreshDecision {
  if (!tokens || !tokens.refreshToken || !tokens.expiresIn || tokens.expiresIn <= 0) {
    return { kind: "no-refresh-token" };
  }

  const expiresAtMs = tokens.receivedAt + tokens.expiresIn * 1000;
  const triggerAtMs = expiresAtMs - leadSeconds * 1000;
  const delayMs = triggerAtMs - nowMs;

  if (delayMs <= 0) {
    return { kind: "refresh-now" };
  }

  return { kind: "schedule", delayMs: Math.min(delayMs, MAX_SCHEDULE_DELAY_MS) };
}

/**
 * Hook that keeps the stored Tink access token fresh in the background.
 *
 *   - Schedules a timer to refresh ~60s before expiry.
 *   - Re-evaluates whenever the app comes back to the foreground (`AppState`
 *     transitioning to "active"), which also covers the case where the user
 *     just completed the OAuth deep-link round-trip (browser → app re-activate).
 *   - Stops cleanly on unmount.
 *
 * Mount once at the App level, only after the biometric unlock — refreshing
 * while the app is locked would prompt the user with no UI feedback.
 *
 * A failed refresh is logged via `onError` (optional) and the scheduler stops.
 * The user can reconnect from Settings; reconnection persists new tokens and
 * the next foreground tick re-arms the scheduler.
 */
export function useTinkTokenRefreshScheduler(options?: {
  leadSeconds?: number;
  onRefreshed?: (tokens: TinkBridgeTokens) => void;
  onError?: (message: string) => void;
}) {
  const leadSeconds = options?.leadSeconds ?? DEFAULT_REFRESH_LEAD_SECONDS;
  const onRefreshed = options?.onRefreshed;
  const onError = options?.onError;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancelTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      cancelTimer();
      const current = await getTinkBridgeTokens();
      if (cancelled) return;
      const decision = decideNextRefresh(current, Date.now(), leadSeconds);
      if (decision.kind === "no-refresh-token") return;
      if (decision.kind === "schedule") {
        timer = setTimeout(() => {
          void tick();
        }, decision.delayMs);
        return;
      }

      // refresh-now
      try {
        const next = await refreshTinkBridgeTokens();
        if (cancelled) return;
        onRefreshed?.(next);
        const followUp = decideNextRefresh(next, Date.now(), leadSeconds);
        if (followUp.kind === "schedule") {
          timer = setTimeout(() => {
            void tick();
          }, followUp.delayMs);
        }
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : "Token refresh failed.";
        onError?.(message);
        // Don't retry. A bad refresh token won't get better; let the user
        // reconnect from Settings, which triggers a foreground transition
        // and re-arms this hook.
      }
    };

    void tick();

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void tick();
      }
    });

    return () => {
      cancelled = true;
      cancelTimer();
      subscription.remove();
    };
  }, [leadSeconds, onError, onRefreshed]);
}
