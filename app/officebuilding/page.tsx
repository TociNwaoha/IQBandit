/**
 * app/officebuilding/page.tsx
 * Server Component — auth guard + layout shell.
 * TopNav is sticky at top; OfficeBuildingClient fills remaining height.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { getChatMode } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { TopNav } from "@/components/TopNav";
import { OfficeBuildingClient } from "./OfficeBuildingClient";
import { redirect } from "next/navigation";

export default async function OfficeBuildingPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const chatMode = getChatMode();
  const { DEFAULT_MODEL: defaultModel } = getSettings();

  return (
    // h-screen + overflow-hidden keeps the page from scrolling;
    // OfficeBuildingClient handles its own internal scroll
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#F7F7F4" }}>
      <TopNav activePath="/officebuilding" email={session.email} />
      <div className="flex-1 overflow-hidden">
        <OfficeBuildingClient chatMode={chatMode} defaultModel={defaultModel} />
      </div>
    </div>
  );
}
