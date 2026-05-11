export type Env = {
  TINK_CLIENT_ID: string;
  TINK_CLIENT_SECRET: string;
  TINK_REDIRECT_URI: string;
  TINK_API_BASE_URL: string;
  WISE_CLIENT_ID?: string;
  WISE_CLIENT_SECRET?: string;
  WISE_REDIRECT_URI?: string;
  WISE_API_BASE_URL: string;
  APP_DEEP_LINK_SCHEME: string;
  SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS: string;
};
