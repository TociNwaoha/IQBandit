/**
 * lib/container-manager.ts
 * Docker lifecycle management for IQBandit user containers.
 * All Docker commands are executed on the remote VPS via SSH.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import { runCommand } from "@/lib/ssh";
import { getPortsInUse } from "@/lib/instances";

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
 */
export async function ensureDataDirs(userId: string): Promise<void> {
  const base = `/home/iqbandit/users/${userId}`;
  await runCommand(`mkdir -p ${base}/config ${base}/workspace`);
}

// ─── container lifecycle ─────────────────────────────────────────────────────

/**
 * Starts a new OpenClaw container for the given user.
 * Assumes ensureDataDirs has already been called.
 */
export async function createUserContainer(
  userId: string,
  gatewayToken: string,
  hostPort: number
): Promise<void> {
  const name = `openclaw-user-${userId}`;
  const base = `/home/iqbandit/users/${userId}`;

  const cmd = [
    "docker run -d",
    `--name ${name}`,
    `--network iqbandit-network`,
    `--memory="768m"`,
    `--cpus="0.75"`,
    `--restart unless-stopped`,
    `-e OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
    `-e OPENCLAW_SKIP_ONBOARD=true`,
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
