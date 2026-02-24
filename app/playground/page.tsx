/**
 * app/playground/page.tsx
 * Backward-compatibility redirect → /officebuilding.
 * Kept so any old links or bookmarks still work.
 */

import { redirect } from "next/navigation";

export default function PlaygroundPage() {
  redirect("/officebuilding");
}
