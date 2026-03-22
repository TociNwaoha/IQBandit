/**
 * app/dashboard/settings/page.tsx
 * User Options/Settings page — profile and security.
 * Server component: fetches user data directly from DB via session.
 */

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { getUserById } from "@/lib/user-db";
import { AccountForm } from "./AccountForm";
import { PasswordForm } from "./PasswordForm";
import { AppearanceSection } from "./AppearanceSection";

export default async function SettingsPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const user = session.userId ? getUserById(session.userId) : null;

  return (
    <div className="px-8 py-10 max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Options</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Manage your account settings and preferences.</p>
      </div>

      {/* Appearance section */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>Appearance</h2>
        <div className="rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface)" }}>
          <AppearanceSection />
        </div>
      </section>

      {/* Account section */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>Account</h2>
        <div className="rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface)" }}>
          <AccountForm
            initialName={user?.name ?? session.name ?? ""}
            email={user?.email ?? session.email}
            initialAgentName={user?.agent_name ?? ""}
            initialUseCase={user?.use_case ?? ""}
          />
        </div>
      </section>

      {/* Security section — only for password-based accounts */}
      {user?.password_hash && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>Security</h2>
          <div className="rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface)" }}>
            <PasswordForm />
          </div>
        </section>
      )}
    </div>
  );
}
