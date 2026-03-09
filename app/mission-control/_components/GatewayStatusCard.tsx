"use client";

import { useEffect, useState } from "react";

export function GatewayStatusCard() {
  const [status, setStatus] = useState<"healthy" | "unreachable" | "checking">("checking");

  useEffect(() => {
    fetch("/api/mission-control/gateway-health")
      .then((r) => r.json() as Promise<{ status: string }>)
      .then((d) => setStatus(d.status === "healthy" ? "healthy" : "unreachable"))
      .catch(() => setStatus("unreachable"));
  }, []);

  const accentClass =
    status === "healthy"   ? "text-emerald-600" :
    status === "checking"  ? "text-gray-400"    :
                             "text-red-500";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-1 hover:border-gray-300 transition-colors">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Gateway</p>
      <p className={`text-3xl font-bold tabular-nums ${accentClass}`}>
        {status === "healthy" ? "Healthy" : status === "unreachable" ? "Unreachable" : "Checking…"}
      </p>
      <p className="text-xs text-gray-400 mt-1">OpenClaw gateway</p>
    </div>
  );
}
