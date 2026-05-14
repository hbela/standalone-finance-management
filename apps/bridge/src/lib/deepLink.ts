export type OAuthProviderName = "tink";

export type DeepLinkPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export function buildOAuthDeepLink(input: {
  scheme: string;
  provider: OAuthProviderName;
  state: string;
  payload: DeepLinkPayload;
}): string {
  const fragment = new URLSearchParams();
  fragment.set("state", input.state);
  fragment.set("access_token", input.payload.access_token);
  if (input.payload.refresh_token) fragment.set("refresh_token", input.payload.refresh_token);
  if (input.payload.expires_in !== undefined) {
    fragment.set("expires_in", String(input.payload.expires_in));
  }
  if (input.payload.scope) fragment.set("scope", input.payload.scope);
  if (input.payload.token_type) fragment.set("token_type", input.payload.token_type);
  return `${input.scheme}://oauth/${input.provider}#${fragment.toString()}`;
}

export function buildOAuthWebRedirect(input: {
  returnUrl: string;
  provider: OAuthProviderName;
  state: string;
  payload: DeepLinkPayload;
}): string {
  const url = new URL(input.returnUrl);
  const fragment = new URLSearchParams();
  fragment.set("state", input.state);
  fragment.set("access_token", input.payload.access_token);
  if (input.payload.refresh_token) fragment.set("refresh_token", input.payload.refresh_token);
  if (input.payload.expires_in !== undefined) {
    fragment.set("expires_in", String(input.payload.expires_in));
  }
  if (input.payload.scope) fragment.set("scope", input.payload.scope);
  if (input.payload.token_type) fragment.set("token_type", input.payload.token_type);
  url.hash = fragment.toString();
  return url.toString();
}

export function buildOAuthErrorDeepLink(input: {
  scheme: string;
  provider: OAuthProviderName;
  state: string | null;
  error: string;
  errorDescription?: string;
}): string {
  const fragment = new URLSearchParams();
  if (input.state) fragment.set("state", input.state);
  fragment.set("error", input.error);
  if (input.errorDescription) fragment.set("error_description", input.errorDescription);
  return `${input.scheme}://oauth/${input.provider}#${fragment.toString()}`;
}
