/**
 * app/agents/[department]/agentStatus.ts
 * Status computation helpers for agent activity.
 * Pure functions — safe to import in any client or server context.
 *
 * Status rules (based on most-recent message timestamp):
 *   WORKING — last message ≤ 15 minutes ago
 *   IDLE    — last message ≤ 24 hours ago
 *   OFF     — no messages, or last message older than 24 hours
 */

export type AgentStatus = "WORKING" | "IDLE" | "OFF";

const WORKING_MS = 15 * 60 * 1_000;      // 15 minutes
const IDLE_MS    = 24 * 60 * 60 * 1_000; // 24 hours

export function computeStatus(lastActiveAt?: string): AgentStatus {
  if (!lastActiveAt) return "OFF";
  const age = Date.now() - new Date(lastActiveAt).getTime();
  if (age <= WORKING_MS) return "WORKING";
  if (age <= IDLE_MS)    return "IDLE";
  return "OFF";
}

export function formatLastActive(lastActiveAt?: string): string {
  if (!lastActiveAt) return "Never chatted";
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** CSS colour for each status value. */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  WORKING: "rgba(85,239,196,1)",
  IDLE:    "rgba(253,203,110,0.9)",
  OFF:     "rgba(100,100,140,0.7)",
};
