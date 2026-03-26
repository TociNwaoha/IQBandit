"use client";

/**
 * app/integrations/ProviderAvatar.tsx
 * Client component — renders a provider logo from the Simple Icons CDN.
 * Handles:
 *  - Dark mode: swaps to white icons when .dark class is on <html>
 *  - Broken images: falls back to initials avatar via onError
 */

import { useState, useEffect } from "react";

// Maps provider IDs → Simple Icons slugs (cdn.simpleicons.org/{slug})
// null = no icon available; falls back to initials avatar
export const PROVIDER_ICONS: Record<string, string | null> = {
  gmail:            "gmail",
  outlook_mail:     "microsoftoutlook",
  slack:            "slack",
  discord:          "discord",
  microsoft_teams:  "microsoftteams",
  notion:           "notion",
  google_drive:     "googledrive",
  google_sheets:    "googlesheets",
  airtable:         "airtable",
  confluence:       "confluence",
  google_calendar:  "googlecalendar",
  outlook_calendar: "microsoftoutlook",
  calendly:         "calendly",
  meta_ads:         "meta",
  tiktok_ads:       "tiktok",
  google_ads:       "googleads",
  linkedin_ads:     "linkedin",
  klaviyo:          "klaviyo",
  mailchimp:        "mailchimp",
  hubspot:          "hubspot",
  salesforce:       "salesforce",
  pipedrive:        "pipedrive",
  shopify:          "shopify",
  stripe:           "stripe",
  woocommerce:      "woocommerce",
  paypal:           "paypal",
  zendesk:          "zendesk",
  intercom:         "intercom",
  freshdesk:        "freshdesk",
  helpscout:        null,           // Not in Simple Icons — shows initials
  asana:            "asana",
  clickup:          "clickup",
  trello:           "trello",
  jira:             "jira",
  generic_rest_api: null,
  webhook:          null,
};

export function ProviderAvatar({ id, name }: { id: string; name: string }) {
  const [isDark, setIsDark] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    setIsDark(html.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDark(html.classList.contains("dark"));
    });
    observer.observe(html, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const slug     = PROVIDER_ICONS[id] ?? null;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // Brand color in light mode; white in dark mode so icons are visible on dark surfaces
  const iconSrc = slug && !imgErr
    ? isDark
      ? `https://cdn.simpleicons.org/${slug}/ffffff`
      : `https://cdn.simpleicons.org/${slug}`
    : null;

  return (
    <div
      className="w-10 h-10 rounded-xl shadow-sm flex items-center justify-center shrink-0 overflow-hidden"
      style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
    >
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt={name}
          width={22}
          height={22}
          className="object-contain"
          onError={() => setImgErr(true)}
        />
      ) : (
        <span className="text-xs font-bold" style={{ color: "var(--color-text-muted)" }}>
          {initials}
        </span>
      )}
    </div>
  );
}
