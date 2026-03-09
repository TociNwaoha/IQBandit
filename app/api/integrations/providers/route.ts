/**
 * app/api/integrations/providers/route.ts
 * GET — returns the full integration provider registry (safe metadata only).
 *
 * Query params (all optional):
 *   category=<name>    — filter to providers in a specific category
 *   status=<value>     — filter by status: planned | beta | live
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  PROVIDERS,
  CATEGORY_ORDER,
  type IntegrationProvider,
  type ProviderStatus,
} from "@/lib/integrations/providerRegistry";

/** Provider list is static per build; still private (session-gated). No CDN caching. */
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const VALID_STATUSES = new Set<ProviderStatus>(["planned", "beta", "live"]);

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawCategory = request.nextUrl.searchParams.get("category") || undefined;
  const rawStatus   = request.nextUrl.searchParams.get("status")   || undefined;

  // Validate status param — unknown values would silently return empty results otherwise.
  if (rawStatus && !VALID_STATUSES.has(rawStatus as ProviderStatus)) {
    return NextResponse.json(
      { error: `Invalid status: "${rawStatus}". Must be one of: planned, beta, live` },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate category against the known category list.
  const knownCategories = new Set<string>(CATEGORY_ORDER);
  if (rawCategory && !knownCategories.has(rawCategory)) {
    return NextResponse.json(
      { error: `Unknown category: "${rawCategory}"` },
      { status: 400, headers: NO_STORE }
    );
  }

  let providers: IntegrationProvider[] = PROVIDERS;
  if (rawCategory) providers = providers.filter((p) => p.category === rawCategory);
  if (rawStatus)   providers = providers.filter((p) => p.status   === rawStatus);

  return NextResponse.json({ providers }, { headers: NO_STORE });
}
