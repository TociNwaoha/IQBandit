/**
 * lib/skill-installer.ts
 * Installs OpenClaw skills into a user's container workspace via SSH.
 *
 * Skills live on the VPS at: /home/iqbandit/skills/{skillName}/
 * Installed to user workspace: /home/iqbandit/users/{userId}/workspace/skills/{skillName}/
 * Which maps inside the container to: /home/node/.openclaw/workspace/skills/{skillName}/
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import { runCommand } from "@/lib/ssh";

// ─── defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SKILLS = [
  "research-agent",
  "social-x-post",
  "social-media-manager",
  "iqbandit-search",
] as const;

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Installs a single skill into a user's container workspace.
 * Copies from /home/iqbandit/skills/{skillName}/ to the user's workspace.
 * Restarts the container so OpenClaw picks up the new skill.
 *
 * @returns { success: boolean }
 */
export async function installSkill(
  userId: string,
  skillName: string
): Promise<{ success: boolean }> {
  const src = `/home/iqbandit/skills/${skillName}`;
  const dst = `/home/iqbandit/users/${userId}/workspace/skills/${skillName}`;
  const containerName = `openclaw-user-${userId}`;

  try {
    // Ensure skills directory exists in user workspace
    await runCommand(`mkdir -p /home/iqbandit/users/${userId}/workspace/skills`);
    // Copy skill directory
    await runCommand(`cp -r ${src}/ ${dst}/`);
    // Restart container to pick up new skill
    await runCommand(`docker restart ${containerName}`);
    console.log(`[skill-installer] Installed skill '${skillName}' for user ${userId}`);
    return { success: true };
  } catch (err) {
    console.error(`[skill-installer] Failed to install skill '${skillName}' for user ${userId}:`, err);
    return { success: false };
  }
}

/**
 * Installs all default skills for a new user in one batch.
 * Copies all skills first, then restarts the container once.
 * Called automatically after every new container provision.
 */
export async function installDefaultSkills(userId: string): Promise<void> {
  const containerName = `openclaw-user-${userId}`;

  try {
    // Ensure skills directory exists
    await runCommand(`mkdir -p /home/iqbandit/users/${userId}/workspace/skills`);

    // Copy all default skills in one pass (batch to minimize SSH round-trips)
    for (const skillName of DEFAULT_SKILLS) {
      const src = `/home/iqbandit/skills/${skillName}`;
      const dst = `/home/iqbandit/users/${userId}/workspace/skills/${skillName}`;
      try {
        await runCommand(`cp -r ${src}/ ${dst}/`);
        console.log(`[skill-installer] Copied skill '${skillName}' for user ${userId}`);
      } catch (err) {
        // Log but continue — a missing skill source shouldn't block provisioning
        console.warn(
          `[skill-installer] Skipping skill '${skillName}' — source not found:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Single restart after all skills are copied
    await runCommand(`docker restart ${containerName}`);
    console.log(`[skill-installer] Default skills installed and container restarted for user ${userId}`);
  } catch (err) {
    // Non-fatal — container is running, skills can be installed on next restart
    console.error(
      `[skill-installer] installDefaultSkills failed for user ${userId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
