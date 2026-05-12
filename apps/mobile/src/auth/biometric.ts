import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

export type BiometricCapability = {
  /** True on native devices that have a biometric sensor or device passcode. */
  isAvailable: boolean;
  /** True if the user has enrolled at least one biometric credential. */
  isEnrolled: boolean;
  /** True when the platform doesn't expose biometrics at all (web, simulator without keychain). */
  isUnsupported: boolean;
};

export type BiometricAuthResult =
  | { status: "succeeded" }
  | { status: "failed"; message: string }
  | { status: "cancelled" }
  | { status: "unsupported" };

/**
 * Inspects the platform for biometric / device-passcode availability.
 *
 * On web, `LocalAuthentication` is a stub — the gate is bypassed via
 * `isUnsupported: true`. Dev iteration in Expo web stays frictionless;
 * production behavior is native-only by design (M4.5).
 */
export async function probeBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === "web") {
    return { isAvailable: false, isEnrolled: false, isUnsupported: true };
  }
  try {
    const isAvailable = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = isAvailable ? await LocalAuthentication.isEnrolledAsync() : false;
    return { isAvailable, isEnrolled, isUnsupported: false };
  } catch {
    return { isAvailable: false, isEnrolled: false, isUnsupported: true };
  }
}

/**
 * Kicks off the platform biometric prompt. On unsupported platforms (web), resolves
 * with `{ status: "unsupported" }` so the caller can bypass the gate.
 *
 * Pass `disableDeviceFallback: false` (the default) so users with no enrolled
 * biometric can still unlock via device passcode.
 */
export async function authenticateUser(promptMessage: string): Promise<BiometricAuthResult> {
  if (Platform.OS === "web") {
    return { status: "unsupported" };
  }
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Use device passcode",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    if (result.success) {
      return { status: "succeeded" };
    }
    if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      message: result.warning ?? result.error ?? "Authentication failed.",
    };
  } catch (caught) {
    return {
      status: "failed",
      message: caught instanceof Error ? caught.message : "Authentication failed.",
    };
  }
}
