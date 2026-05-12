import * as LocalAuthentication from "expo-local-authentication";

import { authenticateUser, probeBiometricCapability } from "./biometric";

const mockedLocalAuth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

describe("probeBiometricCapability", () => {
  beforeEach(() => {
    mockedLocalAuth.hasHardwareAsync.mockReset();
    mockedLocalAuth.isEnrolledAsync.mockReset();
  });

  test("reports unsupported when hardware probe throws", async () => {
    mockedLocalAuth.hasHardwareAsync.mockRejectedValueOnce(new Error("not linked"));
    const result = await probeBiometricCapability();
    expect(result).toEqual({ isAvailable: false, isEnrolled: false, isUnsupported: true });
  });

  test("reports available + enrolled when both checks succeed", async () => {
    mockedLocalAuth.hasHardwareAsync.mockResolvedValueOnce(true);
    mockedLocalAuth.isEnrolledAsync.mockResolvedValueOnce(true);
    const result = await probeBiometricCapability();
    expect(result).toEqual({ isAvailable: true, isEnrolled: true, isUnsupported: false });
  });

  test("reports available but not enrolled when user hasn't set up biometrics", async () => {
    mockedLocalAuth.hasHardwareAsync.mockResolvedValueOnce(true);
    mockedLocalAuth.isEnrolledAsync.mockResolvedValueOnce(false);
    const result = await probeBiometricCapability();
    expect(result).toEqual({ isAvailable: true, isEnrolled: false, isUnsupported: false });
  });
});

describe("authenticateUser", () => {
  beforeEach(() => {
    mockedLocalAuth.authenticateAsync.mockReset();
  });

  test("returns succeeded when the platform reports success", async () => {
    mockedLocalAuth.authenticateAsync.mockResolvedValueOnce({ success: true } as Awaited<
      ReturnType<typeof LocalAuthentication.authenticateAsync>
    >);
    const result = await authenticateUser("test");
    expect(result).toEqual({ status: "succeeded" });
  });

  test("returns cancelled for user_cancel errors", async () => {
    mockedLocalAuth.authenticateAsync.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>);
    const result = await authenticateUser("test");
    expect(result).toEqual({ status: "cancelled" });
  });

  test("returns failed with a message for other errors", async () => {
    mockedLocalAuth.authenticateAsync.mockResolvedValueOnce({
      success: false,
      error: "not_enrolled",
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>);
    const result = await authenticateUser("test");
    expect(result).toEqual({ status: "failed", message: "not_enrolled" });
  });

  test("catches exceptions thrown by authenticateAsync", async () => {
    mockedLocalAuth.authenticateAsync.mockRejectedValueOnce(new Error("worker died"));
    const result = await authenticateUser("test");
    expect(result).toEqual({ status: "failed", message: "worker died" });
  });
});
