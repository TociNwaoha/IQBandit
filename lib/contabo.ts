/**
 * lib/contabo.ts
 * Contabo VPS API client for IQBandit Pro tier provisioning.
 * Handles OAuth2 token management with in-memory caching.
 * SERVER-SIDE ONLY — never import in "use client" components.
 *
 * Required env vars:
 *   CONTABO_CLIENT_ID
 *   CONTABO_CLIENT_SECRET
 *   CONTABO_API_USER
 *   CONTABO_API_PASSWORD
 *   CONTABO_PRODUCT_ID  (default: V45)
 *   CONTABO_REGION      (default: EU)
 */

// ─── types ────────────────────────────────────────────────────────────────────

export interface CreateVPSOpts {
  displayName: string;
  sshKeys?: number[];
  rootPassword?: string;
  imageId?: string;
}

export interface VPSInstance {
  instanceId: string;
  ip: string;
  status: VPSStatus;
}

export type VPSStatus = "running" | "stopped" | "provisioning";

interface ContaboTokenResponse {
  access_token: string;
  expires_in: number;
}

interface ContaboCreateResponse {
  data: Array<{ instanceId: number; ipConfig?: { v4?: { ip: string } } }>;
}

interface ContaboInstanceResponse {
  data: Array<{
    instanceId: number;
    status: string;
    ipConfig?: { v4?: { ip: string } };
  }>;
}

// ─── token cache ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const clientId     = process.env.CONTABO_CLIENT_ID;
  const clientSecret = process.env.CONTABO_CLIENT_SECRET;
  const apiUser      = process.env.CONTABO_API_USER;
  const apiPassword  = process.env.CONTABO_API_PASSWORD;

  if (!clientId || !clientSecret || !apiUser || !apiPassword) {
    throw new Error("[contabo] Missing CONTABO_* env vars");
  }

  const body = new URLSearchParams({
    grant_type:    "password",
    client_id:     clientId,
    client_secret: clientSecret,
    username:      apiUser,
    password:      apiPassword,
  });

  const res = await fetch(
    "https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token",
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    }
  );

  if (!res.ok) {
    throw new Error(`[contabo] Token fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as ContaboTokenResponse;
  cachedToken     = data.access_token;
  tokenExpiresAt  = now + data.expires_in * 1_000;
  return cachedToken;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function contaboFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const base  = "https://api.contabo.com/v1";

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-request-id": crypto.randomUUID(),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[contabo] ${options.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Provisions a new Contabo VPS for a Pro tier user.
 * Returns the instanceId and IP address once the API accepts the request
 * (note: the server won't be running yet — use waitForVPSReady to poll).
 */
export async function createVPS(opts: CreateVPSOpts): Promise<{ instanceId: string; ip: string }> {
  const productId = process.env.CONTABO_PRODUCT_ID ?? "V45";
  const region    = process.env.CONTABO_REGION ?? "EU";

  const payload: Record<string, unknown> = {
    imageId:     opts.imageId ?? "afecbb85-e2fc-46f0-9684-b46b1faf00bb", // Ubuntu 22.04 LTS
    productId,
    region,
    displayName: opts.displayName,
  };
  if (opts.sshKeys?.length)  payload.sshKeys     = opts.sshKeys;
  if (opts.rootPassword)     payload.rootPassword = opts.rootPassword;

  const data = await contaboFetch<ContaboCreateResponse>("/compute/instances", {
    method: "POST",
    body:   JSON.stringify(payload),
  });

  const instance = data.data[0];
  if (!instance) throw new Error("[contabo] createVPS: empty response data");

  return {
    instanceId: String(instance.instanceId),
    ip:         instance.ipConfig?.v4?.ip ?? "",
  };
}

/**
 * Returns the current status and IP of a Contabo VPS instance.
 */
export async function getVPSStatus(instanceId: string): Promise<VPSInstance> {
  const data = await contaboFetch<ContaboInstanceResponse>(
    `/compute/instances/${instanceId}`
  );
  const instance = data.data[0];
  if (!instance) throw new Error(`[contabo] getVPSStatus: no instance ${instanceId}`);

  let status: VPSStatus = "provisioning";
  const raw = (instance.status ?? "").toLowerCase();
  if (raw === "running") status = "running";
  else if (raw === "stopped") status = "stopped";

  return {
    instanceId: String(instance.instanceId),
    ip:         instance.ipConfig?.v4?.ip ?? "",
    status,
  };
}

/**
 * Polls until the VPS is running or the timeout is reached.
 * Returns the IP address of the ready instance.
 * Default timeout: 10 minutes.
 */
export async function waitForVPSReady(
  instanceId: string,
  timeoutMs = 10 * 60 * 1_000
): Promise<string> {
  const deadline    = Date.now() + timeoutMs;
  const pollInterval = 15_000;

  while (Date.now() < deadline) {
    const { status, ip } = await getVPSStatus(instanceId);
    if (status === "running" && ip) {
      console.log(`[contabo] VPS ${instanceId} is ready at ${ip}`);
      return ip;
    }
    console.log(`[contabo] VPS ${instanceId} status=${status}, waiting...`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`[contabo] Timed out waiting for VPS ${instanceId} to become ready`);
}

/**
 * Terminates and deletes a Contabo VPS instance.
 */
export async function deleteVPS(instanceId: string): Promise<void> {
  await contaboFetch(`/compute/instances/${instanceId}`, { method: "DELETE" });
  console.log(`[contabo] Deleted VPS instance ${instanceId}`);
}
