export type OAuthProviderName = "tink";

export type DeepLinkPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

function appendPayloadFragment(target: URLSearchParams, payload: DeepLinkPayload) {
  target.set("access_token", payload.access_token);
  if (payload.refresh_token) target.set("refresh_token", payload.refresh_token);
  if (payload.expires_in !== undefined) {
    target.set("expires_in", String(payload.expires_in));
  }
  if (payload.scope) target.set("scope", payload.scope);
  if (payload.token_type) target.set("token_type", payload.token_type);
}

export function buildOAuthDeepLink(input: {
  scheme: string;
  provider: OAuthProviderName;
  state: string;
  payload: DeepLinkPayload;
}): string {
  const fragment = new URLSearchParams();
  fragment.set("state", input.state);
  appendPayloadFragment(fragment, input.payload);
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
  appendPayloadFragment(fragment, input.payload);
  url.hash = fragment.toString();
  return url.toString();
}

export function buildOAuthUniversalLink(input: {
  host: string;
  provider: OAuthProviderName;
  state: string;
  payload: DeepLinkPayload;
}): string {
  const fragment = new URLSearchParams();
  fragment.set("state", input.state);
  appendPayloadFragment(fragment, input.payload);
  return `https://${input.host}/oauth/${input.provider}#${fragment.toString()}`;
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

export function buildOAuthErrorWebRedirect(input: {
  returnUrl: string;
  state: string | null;
  error: string;
  errorDescription?: string;
}): string {
  const url = new URL(input.returnUrl);
  const fragment = new URLSearchParams();
  if (input.state) fragment.set("state", input.state);
  fragment.set("error", input.error);
  if (input.errorDescription) fragment.set("error_description", input.errorDescription);
  url.hash = fragment.toString();
  return url.toString();
}

export function buildOAuthErrorUniversalLink(input: {
  host: string;
  provider: OAuthProviderName;
  state: string | null;
  error: string;
  errorDescription?: string;
}): string {
  const fragment = new URLSearchParams();
  if (input.state) fragment.set("state", input.state);
  fragment.set("error", input.error);
  if (input.errorDescription) fragment.set("error_description", input.errorDescription);
  return `https://${input.host}/oauth/${input.provider}#${fragment.toString()}`;
}
