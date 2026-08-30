import type { EbayOAuthTokenResponse } from "./types";

const PRODUCTION_API_BASE = "https://api.ebay.com";
const SANDBOX_API_BASE = "https://api.sandbox.ebay.com";
const OAUTH_TOKEN_PATH = "/identity/v1/oauth2/token";
const CLIENT_CREDENTIALS_SCOPE = "https://api.ebay.com/oauth/api_scope";
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type EbayEnvironment = "PRODUCTION" | "SANDBOX";

export function getEbayEnvironment(): EbayEnvironment {
  return process.env.EBAY_ENVIRONMENT === "SANDBOX" ? "SANDBOX" : "PRODUCTION";
}

export function getEbayApiBaseUrl(): string {
  return getEbayEnvironment() === "SANDBOX" ? SANDBOX_API_BASE : PRODUCTION_API_BASE;
}

export function requireEbayAppCredentials(): { appId: string; certId: string } {
  const appId = process.env.EBAY_APP_ID?.trim() ?? "";
  const certId = process.env.EBAY_CERT_ID?.trim() ?? "";
  const missing: string[] = [];

  if (!appId) missing.push("EBAY_APP_ID");
  if (!certId) missing.push("EBAY_CERT_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing eBay API credentials: ${missing.join(" and ")}. ` +
        `Set ${missing.join(" and ")} in your .env file before calling the eBay API.`,
    );
  }

  return { appId, certId };
}

export class EbayAuthManager {
  private static accessToken: string | null = null;
  private static expiresAt = 0;
  private static inflight: Promise<string> | null = null;

  static async getAccessToken(): Promise<string> {
    if (this.hasFreshCache()) {
      return this.accessToken as string;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.refreshAccessToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  static invalidate(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  private static hasFreshCache(): boolean {
    if (!this.accessToken) return false;
    return this.expiresAt - Date.now() > REFRESH_SKEW_MS;
  }

  private static async refreshAccessToken(): Promise<string> {
    const { appId, certId } = requireEbayAppCredentials();
    const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");
    const url = `${getEbayApiBaseUrl()}${OAUTH_TOKEN_PATH}`;

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
          `for ${getEbayEnvironment()}: ${rawBody || "no response body"}`,
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
    return this.accessToken;
  }
}
