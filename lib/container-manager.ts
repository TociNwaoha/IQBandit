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
 * Also writes an openclaw.json config so the gateway binds to the LAN interface
 * (0.0.0.0) rather than loopback-only, making Docker port mapping work.
 * Safe to call multiple times (mkdir -p).
 */
export async function ensureDataDirs(userId: string): Promise<void> {
  const base = `/home/iqbandit/users/${userId}`;
  await runCommand(`mkdir -p ${base}/config ${base}/workspace`);
  // gateway.bind=lan makes openclaw-gateway listen on 0.0.0.0 instead of
  // 127.0.0.1 (loopback), which is required for Docker port mapping to work.
  const cfg = JSON.stringify({ gateway: { bind: "lan" } });
  await runCommand(`echo '${cfg}' > ${base}/config/openclaw.json`);
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

  const llmEnv = userConfig.model_mode === "byok" && userConfig.byok_api_key
    ? [
        `OPENAI_API_KEY=${userConfig.byok_api_key}`,
        `OPENAI_BASE_URL=${userConfig.byok_base_url ?? ""}`,
        `OPENAI_MODEL=${userConfig.byok_model_id ?? "gpt-4o"}`,
      ]
    : [
        // BanditLM — DeepSeek under the hood
        `OPENAI_API_KEY=${process.env.DEEPSEEK_API_KEY ?? ""}`,
        `OPENAI_BASE_URL=https://api.deepseek.com/v1`,
        `OPENAI_MODEL=deepseek-chat`,
      ];

  const searchEnv = [
    `SEARCH_SERVICE_URL=http://iqbandit-search:9000`,
    `SEARXNG_URL=http://iqbandit-searxng:8080`,
  ];

  // Node.js default heap limit (~512MB) is too low for openclaw-gateway.
  // Set it to 90% of the container memory limit (numeric portion only).
  const memMB = parseInt(limits.memory, 10);
  const heapMB = Math.floor(memMB * 0.9);

  const envFlags = [...llmEnv, ...searchEnv, `NODE_OPTIONS=--max-old-space-size=${heapMB}`]
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
