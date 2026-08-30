import { getEbayRuntimeConfig } from "@/services/config";

import type { EbayOAuthTokenResponse } from "./types";

const PRODUCTION_API_BASE = "https://api.ebay.com";
const SANDBOX_API_BASE = "https://api.sandbox.ebay.com";
const OAUTH_TOKEN_PATH = "/identity/v1/oauth2/token";
const CLIENT_CREDENTIALS_SCOPE = "https://api.ebay.com/oauth/api_scope";
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type EbayEnvironment = "PRODUCTION" | "SANDBOX";

export interface EbayResolvedConfig {
  appId: string;
  certId: string;
  environment: EbayEnvironment;
  marketplaceId: string;
}

export function ebayApiBaseUrl(environment: EbayEnvironment): string {
  return environment === "SANDBOX" ? SANDBOX_API_BASE : PRODUCTION_API_BASE;
}

export async function getEbayEnvironment(): Promise<EbayEnvironment> {
  const config = await getEbayRuntimeConfig();
  return config.environment;
}

export async function getEbayApiBaseUrl(): Promise<string> {
  return ebayApiBaseUrl(await getEbayEnvironment());
}

export async function requireEbayAppCredentials(): Promise<EbayResolvedConfig> {
  const config = await getEbayRuntimeConfig();
  const missing: string[] = [];
  if (!config.appId) missing.push("EBAY_APP_ID");
  if (!config.certId) missing.push("EBAY_CERT_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing eBay API credentials: ${missing.join(" and ")}. ` +
        `Add them in Settings → eBay Account, or set ${missing.join(" and ")} in .env.`,
    );
  }

  return config;
}

export class EbayAuthManager {
  private static accessToken: string | null = null;
  private static expiresAt = 0;
  private static credentialKey: string | null = null;
  private static inflight: Promise<string> | null = null;

  static async getAccessToken(): Promise<string> {
    const config = await requireEbayAppCredentials();
    const key = credentialCacheKey(config);

    if (this.credentialKey !== key) {
      this.invalidate();
      this.credentialKey = key;
    }

    if (this.hasFreshCache()) {
      return this.accessToken as string;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.refreshAccessToken(config).finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  static invalidate(): void {
    this.accessToken = null;
    this.expiresAt = 0;
    this.credentialKey = null;
  }

  private static hasFreshCache(): boolean {
    if (!this.accessToken) return false;
    return this.expiresAt - Date.now() > REFRESH_SKEW_MS;
  }

  private static async refreshAccessToken(config: EbayResolvedConfig): Promise<string> {
    const credentials = Buffer.from(`${config.appId}:${config.certId}`).toString("base64");
    const url = `${ebayApiBaseUrl(config.environment)}${OAUTH_TOKEN_PATH}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: CLIENT_CREDENTIALS_SCOPE,
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reach eBay OAuth token endpoint (${url}): ${reason}`);
    }

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `eBay OAuth token request failed (${response.status} ${response.statusText}) ` +
          `for ${config.environment}: ${rawBody || "no response body"}`,
      );
    }

    let payload: EbayOAuthTokenResponse;
    try {
      payload = JSON.parse(rawBody) as EbayOAuthTokenResponse;
    } catch {
      throw new Error("eBay OAuth token response was not valid JSON.");
    }

    if (!payload.access_token || typeof payload.expires_in !== "number") {
      throw new Error("eBay OAuth token response is missing access_token or expires_in.");
    }

    this.accessToken = payload.access_token;
    this.expiresAt = Date.now() + payload.expires_in * 1000;
    this.credentialKey = credentialCacheKey(config);
    return this.accessToken;
  }
}

function credentialCacheKey(config: EbayResolvedConfig): string {
  return `${config.environment}:${config.appId}:${config.certId}`;
}
