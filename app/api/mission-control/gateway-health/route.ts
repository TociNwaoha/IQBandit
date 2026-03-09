import { NextResponse } from "next/server";

export async function GET() {
  try {
    const gwUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:19001";
    const res   = await fetch(`${gwUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return NextResponse.json({ status: res.ok ? "healthy" : "unreachable" });
  } catch {
    return NextResponse.json({ status: "unreachable" });
  }
}
