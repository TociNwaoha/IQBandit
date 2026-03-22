"use client";

/**
 * hooks/useAgentStatus.ts
 * Fetches agent setup progress from /api/connections/status.
 * Polls every 30 seconds and responds to 'connectionUpdated' events
 * dispatched by connection forms after a successful save.
 */

import { useState, useEffect, useCallback } from "react";

export interface AgentStatus {
  progress: number;
  connected: string[];
  missing?: string[];
  handle?: string | null;
  name?: string | null;
}

export interface AgentStatusMap {
  [agentName: string]: AgentStatus;
}

export interface UseAgentStatusResult {
  agents: AgentStatusMap | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useAgentStatus(): UseAgentStatusResult {
  const [agents, setAgents] = useState<AgentStatusMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(() => {
    fetch("/api/connections/status")
      .then((res) => (res.ok ? (res.json() as Promise<AgentStatusMap>) : null))
      .then((data) => {
        if (data) setAgents(data);
      })
      .catch(() => {
        // silently ignore — shows loading skeleton or stale state
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refetch();

    // Poll every 30 seconds
    const interval = setInterval(refetch, 30_000);

    // Respond to manual refresh events (e.g., after saving Twitter keys)
    const handleConnectionUpdated = () => refetch();
    window.addEventListener("connectionUpdated", handleConnectionUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener("connectionUpdated", handleConnectionUpdated);
    };
  }, [refetch]);

  return { agents, isLoading, refetch };
}
