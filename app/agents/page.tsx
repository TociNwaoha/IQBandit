/**
 * app/agents/page.tsx
 * Protected server page — renders the pixel office hub.
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { Press_Start_2P }        from "next/font/google";
import PixelOfficeHub             from "./PixelOfficeHub";

const pixelFont = Press_Start_2P({
  weight:   "400",
  subsets:  ["latin"],
  variable: "--font-pixel",
});

export default async function AgentsPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className={pixelFont.variable} style={{ minHeight: "100vh" }}>
      <PixelOfficeHub />
    </div>
  );
}
