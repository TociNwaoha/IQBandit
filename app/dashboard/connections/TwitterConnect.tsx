"use client";

/**
 * app/dashboard/connections/TwitterConnect.tsx
 * X/Twitter BYOK credential form.
 * Submits to POST /api/connections/twitter and dispatches connectionUpdated event on success.
 */

import { useState } from "react";
import { SetupGuide, type GuideStep } from "@/components/SetupGuide";
import { Button, Card, Badge } from "@/components/ui";

const TWITTER_SETUP_STEPS: GuideStep[] = [
  {
    number: 1,
    title:  "Create a developer account",
    description:
      "Go to developer.twitter.com and sign up for free. A basic developer account gives you everything you need.",
    link: { label: "Open developer.twitter.com", href: "https://developer.twitter.com" },
  },
  {
    number: 2,
    title:  "Create a project and app",
    description:
      "Once logged in, click '+ Add App' to create a new app. Name it anything — 'My IQBandit' works fine.",
  },
  {
    number: 3,
    title:  "Set app permissions",
    description:
      "In your app settings, set permissions to 'Read and Write'. This allows your agent to post on your behalf.",
  },
  {
    number: 4,
    title:  "Get your keys",
    description:
      "Go to the 'Keys and Tokens' tab. You need all four values: API Key, API Secret, Access Token, Access Token Secret. Click 'Generate' if Access Token/Secret aren't shown yet.",
  },
  {
    number: 5,
    title:  "Paste them in the form",
    description:
      "Enter all four values in the form on the right and click 'Connect X Account'.",
  },
];

interface TwitterConnectProps {
  initialConnected: boolean;
  initialHandle?: string;
  initialName?: string;
}

interface FormFields {
  apiKey:       string;
  apiSecret:    string;
  accessToken:  string;
  accessSecret: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

export function TwitterConnect({
  initialConnected,
  initialHandle,
}: TwitterConnectProps) {
  const [fields, setFields] = useState<FormFields>({
    apiKey:       "",
    apiSecret:    "",
    accessToken:  "",
    accessSecret: "",
  });
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [connected, setConnected] = useState(initialConnected);
  const [handle,    setHandle]    = useState(initialHandle ?? "");
  const [showForm,  setShowForm]  = useState(!initialConnected);

  const currentStep = 5; // guide step — all steps listed, user fills form at step 5

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.apiKey || !fields.apiSecret || !fields.accessToken || !fields.accessSecret) {
      setErrorMsg("All four fields are required.");
      setFormState("error");
      return;
    }

    setFormState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/connections/twitter", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      });

      const data = (await res.json()) as { success?: boolean; error?: string; handle?: string };

      if (!res.ok || !data.success) {
        setErrorMsg(data.error ?? "Failed to connect. Check your keys and try again.");
        setFormState("error");
        return;
      }

      setConnected(true);
      setHandle(data.handle ?? "");
      setFormState("success");
      setShowForm(false);

      // Notify all useAgentStatus instances to refresh
      window.dispatchEvent(new CustomEvent("connectionUpdated"));
    } catch {
      setErrorMsg("Network error — please try again.");
      setFormState("error");
    }
  }

  async function handleDisconnect() {
    try {
      await fetch("/api/connections/twitter", { method: "DELETE" });
      setConnected(false);
      setHandle("");
      setShowForm(true);
      setFormState("idle");
      window.dispatchEvent(new CustomEvent("connectionUpdated"));
    } catch {
      // ignore
    }
  }

  function setField(key: keyof FormFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (formState === "error") setFormState("idle");
  }

  return (
    <Card>
      {/* Card header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3">
          <span className="text-xl">𝕏</span>
          <div>
            <p className="text-sm font-semibold text-zinc-100">X / Twitter</p>
            <p className="text-xs text-zinc-500">Bring Your Own Keys (BYOK)</p>
          </div>
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-400">{handle || "Connected"}</span>
          </div>
        )}
      </div>

      {/* Connected state — show handle + reconnect option */}
      {connected && !showForm && (
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-300">
              ✓ Connected as <span className="font-medium">{handle || "your account"}</span>
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              Your agent can post on X on your behalf.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowForm(true)}>
              Update keys
            </Button>
            <Button variant="danger" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* Setup guide + form */}
      {showForm && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: setup guide */}
            <div>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-4">
                How to get your keys
              </p>
              <SetupGuide steps={TWITTER_SETUP_STEPS} currentStep={currentStep} />
            </div>

            {/* Right: form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-1">
                Enter keys
              </p>

              {(
                [
                  { key: "apiKey",       label: "API Key",            placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxx" },
                  { key: "apiSecret",    label: "API Key Secret",     placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
                  { key: "accessToken",  label: "Access Token",       placeholder: "0000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
                  { key: "accessSecret", label: "Access Token Secret",placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
                ] as const
              ).map(({ key, label, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">{label}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={fields[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors font-mono"
                  />
                </div>
              ))}

              {/* Error */}
              {formState === "error" && (
                <Badge variant="error" className="!px-3 !py-2 !rounded-lg !text-xs w-full">
                  {errorMsg}
                </Badge>
              )}

              {/* Buttons */}
              <div className="flex gap-2 mt-1">
                <Button
                  type="submit"
                  loading={formState === "submitting"}
                  className="flex-1"
                >
                  Connect X Account
                </Button>
                {connected && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              <p className="text-[10px] text-zinc-700 leading-relaxed">
                Keys are encrypted (AES-256-CBC) before storage. They are never logged or exposed to the browser after submission.
              </p>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
