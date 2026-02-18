// Feature 3: OAuth — AWS Builder ID Device Code Flow

import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

export const SSO_OIDC_ENDPOINT = "https://oidc.us-east-1.amazonaws.com";
export const BUILDER_ID_START_URL = "https://view.awsapps.com/start";
export const SSO_SCOPES = [
  "codewhisperer:completions",
  "codewhisperer:analysis",
  "codewhisperer:conversations",
  "codewhisperer:transformations",
  "codewhisperer:taskassist",
];

export interface KiroCredentials extends OAuthCredentials {
  clientId: string;
  clientSecret: string;
  region: string;
}

export async function loginKiroBuilderID(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  // First, try to load credentials from kiro-cli
  const { getKiroCliCredentials } = await import("./kiro-cli.js");
  const cliCreds = getKiroCliCredentials();
  if (cliCreds) {
    (callbacks as unknown as { onProgress?: (msg: string) => void }).onProgress?.(
      "Using existing kiro-cli credentials",
    );
    return cliCreds;
  }

  // Fall back to device code flow
  const regResp = await fetch(`${SSO_OIDC_ENDPOINT}/client/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "pi-cli" },
    body: JSON.stringify({
      clientName: "pi-cli",
      clientType: "public",
      scopes: SSO_SCOPES,
      grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    }),
  });
  if (!regResp.ok) throw new Error(`Client registration failed: ${regResp.status}`);
  const { clientId, clientSecret } = (await regResp.json()) as { clientId: string; clientSecret: string };

  const devResp = await fetch(`${SSO_OIDC_ENDPOINT}/device_authorization`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "pi-cli" },
    body: JSON.stringify({ clientId, clientSecret, startUrl: BUILDER_ID_START_URL }),
  });
  if (!devResp.ok) throw new Error(`Device authorization failed: ${devResp.status}`);
  const devAuth = (await devResp.json()) as {
    verificationUri: string;
    verificationUriComplete: string;
    userCode: string;
    deviceCode: string;
    interval: number;
    expiresIn: number;
  };

  (callbacks as unknown as { onAuth: (info: { url: string; instructions: string }) => void }).onAuth({
    url: devAuth.verificationUriComplete,
    instructions: `Your code: ${devAuth.userCode}`,
  });

  const interval = (devAuth.interval || 5) * 1000;
  const maxAttempts = Math.floor((devAuth.expiresIn || 600) / (devAuth.interval || 5));
  let currentInterval = interval;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if ((callbacks as unknown as { signal?: AbortSignal }).signal?.aborted) throw new Error("Login cancelled");
    await new Promise((r) => setTimeout(r, currentInterval));
    const tokResp = await fetch(`${SSO_OIDC_ENDPOINT}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "pi-cli" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode: devAuth.deviceCode,
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const tokData = (await tokResp.json()) as {
      error?: string;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    if (tokData.error === "authorization_pending") continue;
    if (tokData.error === "slow_down") {
      currentInterval += interval;
      continue;
    }
    if (tokData.error) throw new Error(`Authorization failed: ${tokData.error}`);
    if (tokData.accessToken && tokData.refreshToken) {
      return {
        refresh: `${tokData.refreshToken}|${clientId}|${clientSecret}|idc`,
        access: tokData.accessToken,
        expires: Date.now() + (tokData.expiresIn || 3600) * 1000 - 5 * 60 * 1000,
        clientId,
        clientSecret,
        region: "us-east-1",
      };
    }
  }
  throw new Error("Authorization timed out");
}

export async function refreshKiroToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  const parts = credentials.refresh.split("|");
  const refreshToken = parts[0] ?? "";
  const clientId = parts[1] ?? "";
  const clientSecret = parts[2] ?? "";
  const response = await fetch(`${SSO_OIDC_ENDPOINT}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "pi-cli" },
    body: JSON.stringify({ clientId, clientSecret, refreshToken, grantType: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  const data = (await response.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
  return {
    refresh: `${data.refreshToken}|${clientId}|${clientSecret}|idc`,
    access: data.accessToken,
    expires: Date.now() + data.expiresIn * 1000 - 5 * 60 * 1000,
    clientId: clientId,
    clientSecret: clientSecret,
    region: (credentials as KiroCredentials).region || "us-east-1",
  };
}
