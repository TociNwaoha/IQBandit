/**
 * lib/container-manager.ts
 * Docker lifecycle management for IQBandit user containers.
 * All Docker commands are executed on the remote VPS via SSH.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import { runCommand } from "@/lib/ssh";
import { getPortsInUse } from "@/lib/instances";
import { getPlanLimits, type PlanId } from "@/lib/plans";

// ─── LLM config passed at provision time ──────────────────────────────────────

export interface UserLLMConfig {
  model_mode: "banditlm" | "byok";
  byok_api_key?: string;   // already decrypted before passing in
  byok_base_url?: string;
  byok_model_id?: string;
}

// ─── port allocation ──────────────────────────────────────────────────────────

const PORT_START = 20_000;

/**
 * Returns the next available host port starting at PORT_START.
 * Reads currently-in-use ports from the SQLite instances table.
 */
export function allocatePort(): number {
  const used = new Set(getPortsInUse());
  let port = PORT_START;
  while (used.has(port)) port++;
  return port;
}

// ─── data dirs ────────────────────────────────────────────────────────────────

/**
 * Creates the VPS data directories for a user before starting their container.
 * Safe to call multiple times (mkdir -p).
 * The openclaw.json config is written by createUserContainer (which has LLM config).
 */
export async function ensureDataDirs(userId: string): Promise<void> {
  const base = `/home/iqbandit/users/${userId}`;
  await runCommand(`mkdir -p ${base}/config ${base}/workspace`);
}

// ─── container lifecycle ─────────────────────────────────────────────────────

/**
 * Starts a new OpenClaw container for the given user.
 * Resource limits (memory, CPUs, storage) are derived from the user's plan.
 * Assumes ensureDataDirs has already been called.
 */
export async function createUserContainer(
  userId: string,
  gatewayToken: string,
  hostPort: number,
  planId: PlanId,
  userConfig: UserLLMConfig,
): Promise<void> {
  const name   = `openclaw-user-${userId}`;
  const base   = `/home/iqbandit/users/${userId}`;
  const limits = getPlanLimits(planId);

  // ── Build openclaw.json for this user ───────────────────────────────────────
  // provider/model-id format is what OpenClaw's model registry uses internally.
  // gateway.bind=lan makes the gateway listen on 0.0.0.0 (required for Docker
  // port mapping). chatCompletions.enabled=true activates the REST endpoint.
  const isByok = userConfig.model_mode === "byok" && Boolean(userConfig.byok_api_key);
  const providerName = isByok ? "byok" : "deepseek";
  const modelId      = isByok ? (userConfig.byok_model_id ?? "gpt-4o") : "deepseek-chat";
  const providerCfg  = isByok
    ? {
        baseUrl: userConfig.byok_base_url ?? "https://api.openai.com/v1",
        apiKey:  userConfig.byok_api_key!,
        api:     "openai-completions",
        models:  [{ id: modelId, name: "Custom (BYOK)", reasoning: false, input: ["text"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 128000, maxTokens: 16000 }],
      }
    : {
        baseUrl: "https://api.deepseek.com/v1",
        apiKey:  process.env.DEEPSEEK_API_KEY ?? "",
        api:     "openai-completions",
        models:  [{ id: "deepseek-chat", name: "BanditLM", reasoning: false, input: ["text"],
                    cost: { input: 1.0, output: 5.0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 64000, maxTokens: 8000 }],
      };

  const openclawConfig = {
    agents: { defaults: { compaction: { mode: "safeguard" }, model: `${providerName}/${modelId}` } },
    models: { mode: "merge", providers: { [providerName]: providerCfg } },
    commands: { native: "auto", nativeSkills: "auto", restart: true, ownerDisplay: "raw" },
    gateway: {
      bind: "lan",
      controlUi: { allowedOrigins: ["http://localhost:18789", "http://127.0.0.1:18789"] },
      http: { endpoints: { chatCompletions: { enabled: true } } },
    },
  };

  // base64-encode so the JSON survives shell quoting regardless of key contents
  const cfgB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString("base64");
  await runCommand(`echo ${cfgB64} | base64 -d > ${base}/config/openclaw.json`);

  const searchEnv = [
    `SEARCH_SERVICE_URL=http://iqbandit-search:9000`,
    `SEARXNG_URL=http://iqbandit-searxng:8080`,
  ];

  // Node.js default heap limit (~512MB) is too low for openclaw-gateway.
  // Set it to 90% of the container memory limit (numeric portion only).
  const memMB = parseInt(limits.memory, 10);
  const heapMB = Math.floor(memMB * 0.9);

  const envFlags = [...searchEnv, `NODE_OPTIONS=--max-old-space-size=${heapMB}`]
    .map((e) => `-e "${e}"`)
    .join(" \\\n  ");

  const cmd = [
    "docker run -d",
    `--name ${name}`,
    `--network iqbandit-network`,
    `--memory="${limits.memory}"`,
    `--cpus="${limits.cpus}"`,
    `--storage-opt size=${limits.storage}`,
    `--restart unless-stopped`,
    `-e OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
    `-e OPENCLAW_SKIP_ONBOARD=true`,
    envFlags,
    `-p ${hostPort}:18789`,
    `-v ${base}/config:/home/node/.openclaw`,
    `-v ${base}/workspace:/home/node/.openclaw/workspace`,
    `ghcr.io/openclaw/openclaw`,
  ].join(" \\\n  ");

  await runCommand(cmd);
}

/** Pauses (freezes) a running container. */
export async function pauseUserContainer(userId: string): Promise<void> {
  await runCommand(`docker pause openclaw-user-${userId}`);
}

/** Resumes a paused container. */
export async function resumeUserContainer(userId: string): Promise<void> {
  await runCommand(`docker unpause openclaw-user-${userId}`);
}

/**
 * Force-removes the container and deletes all user data on the VPS.
 * Irreversible — only call after the 14-day grace period.
 */
export async function deleteUserContainer(userId: string): Promise<void> {
  await runCommand(`docker rm -f openclaw-user-${userId}`);
  await runCommand(`rm -rf /home/iqbandit/users/${userId}`);
}

// ─── status ───────────────────────────────────────────────────────────────────

export type ContainerStatus = "running" | "paused" | "stopped" | "missing";

/**
 * Returns the live status of a user's container.
 * Returns "missing" if the container doesn't exist or docker inspect fails.
 */
export async function getContainerStatus(userId: string): Promise<ContainerStatus> {
  try {
    const { stdout } = await runCommand(
      `docker inspect --format='{{.State.Status}}' openclaw-user-${userId}`
    );
    const raw = stdout.replace(/'/g, "").trim().toLowerCase();
    if (raw === "running") return "running";
    if (raw === "paused")  return "paused";
    if (raw === "exited" || raw === "stopped") return "stopped";
    return "missing";
  } catch {
    return "missing";
  }
}
