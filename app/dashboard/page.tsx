import { redirect } from "next/navigation";

/**
 * /dashboard is now retired — gateway health lives in /settings.
 * Redirect any old links seamlessly to the new home.
 */
export default function DashboardPage() {
  redirect("/marketplace");
}
