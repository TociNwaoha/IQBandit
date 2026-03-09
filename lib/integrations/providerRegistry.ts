/**
 * lib/integrations/providerRegistry.ts
 * Single source of truth for the IQ BANDIT integration provider catalogue.
 *
 * All entries are metadata-only. No OAuth flows, credential storage, or API
 * calls are wired up yet. Fields are designed to support future connection
 * management without hard-coding provider-specific logic anywhere else.
 *
 * SERVER-SIDE SAFE — no secrets. Can be imported in server components and API
 * routes. Do NOT import directly in "use client" code.
 */

// ─── shared types ─────────────────────────────────────────────────────────────

/** Authentication mechanism used when connecting to a provider. */
export type AuthType = "oauth2" | "api_key" | "none" | "webhook";

/** Rollout stage of the integration. */
export type ProviderStatus = "planned" | "beta" | "live";

/**
 * How the integration executes at runtime:
 *   direct   — a built-in Next.js API route calls the provider directly
 *   openclaw — routed through the OpenClaw gateway
 *   mcp      — exposed as MCP tools consumed by an AI agent
 *   hybrid   — not yet decided; may use any combination of the above
 *
 * Use "hybrid" for planned providers whose architecture is not yet committed.
 * Only use "direct" / "openclaw" / "mcp" when the implementation choice is firm.
 */
export type ExecutionMode = "direct" | "openclaw" | "mcp" | "hybrid";

/**
 * How far along the implementation is:
 *   metadata_only    — registry entry only; no adapter code exists
 *   adapter_planned  — adapter design is sketched; implementation not started
 *   adapter_live     — adapter is implemented and testable
 */
export type ImplementationStatus =
  | "metadata_only"
  | "adapter_planned"
  | "adapter_live";

/**
 * The UX flow used to collect credentials from the user:
 *   oauth_redirect   — redirect user to provider's OAuth consent screen
 *   api_key_form     — user pastes a key / token into a form field
 *   webhook_inbound  — we generate a URL; user configures their service to POST to it
 *   manual           — neither credential nor redirect; user configures externally
 */
export type ConnectionMethod =
  | "oauth_redirect"
  | "api_key_form"
  | "webhook_inbound"
  | "manual";

export interface IntegrationProvider {
  /** Stable machine identifier — never changes after creation. */
  id: string;
  /** Human-readable name shown in UI. */
  displayName: string;

  // ── auth ──────────────────────────────────────────────────────────────────
  /** All supported authentication methods for this provider. */
  authTypes: AuthType[];
  /**
   * The auth method shown by default in connection UI.
   * Must be one of `authTypes`.
   */
  preferredAuthType: AuthType;
  /**
   * OAuth2 permission scopes (for oauth2 providers) or permission
   * capability labels (for api_key types). Placeholder values for planned
   * providers — refined before live.
   */
  scopes: string[];

  // ── identity ──────────────────────────────────────────────────────────────
  /** Category label — must match a value in CATEGORY_ORDER. */
  category: string;
  /** Current rollout stage. */
  status: ProviderStatus;
  /** How far the implementation has progressed. Defaults to "metadata_only". */
  implementationStatus: ImplementationStatus;

  // ── execution ─────────────────────────────────────────────────────────────
  /** Planned or actual execution architecture. Use "hybrid" if undecided. */
  executionMode: ExecutionMode;

  // ── capabilities ──────────────────────────────────────────────────────────
  /** Whether this integration can pull data from the provider. */
  supportsRead: boolean;
  /** Whether this integration can push data or trigger actions. */
  supportsWrite: boolean;
  /**
   * Fine-grained capability identifiers used for tool routing.
   * Format: verb_noun, e.g. "read_email", "send_message", "create_record".
   */
  capabilities: string[];

  // ── connection UX metadata ─────────────────────────────────────────────────
  /** UX flow used to collect credentials. Derived from preferredAuthType. */
  connectionMethod: ConnectionMethod;
  /**
   * Label for the credential input shown in the connection form.
   * E.g. "API Key", "Bot Token", "Personal Access Token".
   * Omit for pure OAuth redirect flows where no manual credential is entered.
   */
  credentialLabel?: string;
  /**
   * Short provider-specific warning or setup note shown near the connect button.
   * Use for known footguns, required preconditions, or scoping caveats.
   */
  setupNotes?: string;

  // ── content ───────────────────────────────────────────────────────────────
  /** One-sentence description shown in the overview UI. */
  description: string;
  /** Link to the provider's developer / API documentation. */
  docsUrl?: string;
}

// ─── category ordering ────────────────────────────────────────────────────────

/**
 * Canonical category order for display.
 * Categories not listed here appear after, in registry insertion order.
 */
export const CATEGORY_ORDER = [
  "Communication",
  "Productivity / Knowledge",
  "Calendar / Scheduling",
  "Marketing / Ads",
  "CRM / Sales",
  "E-commerce / Payments",
  "Support / Tickets",
  "Project / Ops",
  "Generic",
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];

// ─── provider registry ────────────────────────────────────────────────────────

export const PROVIDERS: IntegrationProvider[] = [

  // ── Communication ──────────────────────────────────────────────────────────

  {
    id: "gmail",
    displayName: "Gmail",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    category: "Communication",
    status: "beta",
    implementationStatus: "adapter_live",
    executionMode: "direct",
    supportsRead: true,
    supportsWrite: false,  // read-only in current release
    capabilities: ["read_email", "search_email", "list_labels"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a Google Cloud project with the Gmail API enabled and an OAuth consent screen (External or Internal). " +
      "Only gmail.readonly scope is requested. Tokens auto-refresh via the stored refresh token — no manual reconnect needed until the refresh token is revoked.",
    description: "Search and read Gmail messages and labels via OAuth. Tokens auto-refresh.",
    docsUrl: "https://developers.google.com/gmail/api",
  },
  {
    id: "outlook_mail",
    displayName: "Outlook Mail",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["Mail.Read", "Mail.Send"],
    category: "Communication",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_email", "send_email", "search_email"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires an Azure AD app registration with delegated Mail.Read and Mail.Send permissions.",
    description: "Read and send emails via Microsoft Outlook / Exchange Online.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview",
  },
  {
    id: "slack",
    displayName: "Slack",
    authTypes: ["oauth2", "api_key"],
    preferredAuthType: "oauth2",
    scopes: ["channels:read", "chat:write", "messages:read"],
    category: "Communication",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_messages", "send_message", "list_channels", "react_to_message"],
    connectionMethod: "oauth_redirect",
    credentialLabel: "Bot Token",
    setupNotes:
      "OAuth app must be installed to the workspace. Bot token scopes are fixed at install time — reinstall the app to change them.",
    description: "Post messages, read channels, and react to events in Slack workspaces.",
    docsUrl: "https://api.slack.com",
  },
  {
    id: "discord",
    displayName: "Discord",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Communication",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_messages", "send_message", "list_channels"],
    connectionMethod: "api_key_form",
    credentialLabel: "Bot Token",
    setupNotes:
      "Create a bot in the Discord Developer Portal and invite it to your server with the required permissions before connecting.",
    description: "Send messages and read channels via a Discord Bot token.",
    docsUrl: "https://discord.com/developers/docs",
  },
  {
    id: "microsoft_teams",
    displayName: "Microsoft Teams",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["ChannelMessage.Read.All", "ChannelMessage.Send"],
    category: "Communication",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_messages", "send_message", "list_channels"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires an Azure AD app with Teams-specific delegated permissions. Application permissions require admin consent.",
    description: "Read and post messages in Microsoft Teams channels.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview",
  },

  // ── Productivity / Knowledge ───────────────────────────────────────────────

  {
    id: "notion",
    displayName: "Notion",
    authTypes: ["oauth2", "api_key"],
    preferredAuthType: "oauth2",
    scopes: ["read_content", "update_content", "create_content"],
    category: "Productivity / Knowledge",
    status: "beta",
    implementationStatus: "adapter_live",
    executionMode: "direct",
    supportsRead: true,
    supportsWrite: false,  // write operations not yet implemented
    capabilities: ["read_page", "search_pages", "query_database"],
    connectionMethod: "oauth_redirect",
    credentialLabel: "Internal Integration Token",
    setupNotes:
      "OAuth recommended. For internal workspace use, create an Integration Token in Notion settings and share relevant pages with it. Read-only in current release.",
    description: "Search and read Notion pages and databases via OAuth.",
    docsUrl: "https://developers.notion.com",
  },
  {
    id: "google_drive",
    displayName: "Google Drive",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    category: "Productivity / Knowledge",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["list_files", "read_file", "search_files"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a Google Cloud project with the Drive API enabled. Service accounts can be used for server-to-server access.",
    description: "List and read documents, sheets, and files from Google Drive.",
    docsUrl: "https://developers.google.com/drive/api",
  },
  {
    id: "google_sheets",
    displayName: "Google Sheets",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity / Knowledge",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_sheet", "write_cells", "append_rows", "list_sheets"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires the Google Sheets API enabled in your Cloud project. The spreadsheets scope grants full read/write access.",
    description: "Read and write cell data in Google Sheets spreadsheets.",
    docsUrl: "https://developers.google.com/sheets/api",
  },
  {
    id: "airtable",
    displayName: "Airtable",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Productivity / Knowledge",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_records", "create_record", "update_record", "search_records"],
    connectionMethod: "api_key_form",
    credentialLabel: "Personal Access Token",
    setupNotes:
      "Create a Personal Access Token in Airtable's developer hub. Scopes and base access are configured when generating the token.",
    description: "Query and update records in Airtable bases via personal access token.",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
  },
  {
    id: "confluence",
    displayName: "Confluence",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Productivity / Knowledge",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_page", "search_pages", "list_spaces"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Token",
    setupNotes:
      "Uses Atlassian API tokens. Token is scoped to the generating account — use a dedicated service account in production for least-privilege access.",
    description: "Search and read Confluence pages via Atlassian API token.",
    docsUrl: "https://developer.atlassian.com/cloud/confluence/rest/v2/intro",
  },

  // ── Calendar / Scheduling ──────────────────────────────────────────────────

  {
    id: "google_calendar",
    displayName: "Google Calendar",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    category: "Calendar / Scheduling",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_events", "create_event", "update_event", "list_calendars"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires the Google Calendar API enabled. Use the calendar.readonly scope for read-only agents.",
    description: "Read events and create/update calendar entries in Google Calendar.",
    docsUrl: "https://developers.google.com/calendar/api",
  },
  {
    id: "outlook_calendar",
    displayName: "Outlook Calendar",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["Calendars.Read", "Calendars.ReadWrite"],
    category: "Calendar / Scheduling",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_events", "create_event", "update_event"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Delegated Calendars.Read permission is sufficient for read-only. Add Calendars.ReadWrite to create or update events.",
    description: "Read and create events in Microsoft Outlook Calendar.",
  },
  {
    id: "calendly",
    displayName: "Calendly",
    authTypes: ["oauth2", "api_key"],
    preferredAuthType: "api_key",
    scopes: ["default"],
    category: "Calendar / Scheduling",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_events", "read_availability", "list_event_types"],
    connectionMethod: "api_key_form",
    credentialLabel: "Personal Access Token",
    setupNotes:
      "Personal Access Tokens can be generated from Calendly account settings. OAuth is available for multi-user apps.",
    description: "Read scheduled events and availability windows from Calendly.",
    docsUrl: "https://developer.calendly.com",
  },

  // ── Marketing / Ads ────────────────────────────────────────────────────────

  {
    id: "meta_ads",
    displayName: "Meta Ads",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["ads_read"],
    category: "Marketing / Ads",
    status: "beta",
    implementationStatus: "adapter_live",
    executionMode: "direct",
    supportsRead: true,
    supportsWrite: false,   // write operations not yet implemented
    capabilities: ["list_ad_accounts", "read_campaigns", "read_ad_metrics"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a Meta App with the ads_read permission. Ad account access must be granted in Business Manager. Read-only in current release.",
    description: "List ad accounts, campaigns, and pull performance insights from Meta Ads (Facebook / Instagram).",
    docsUrl: "https://developers.facebook.com/docs/marketing-apis",
  },
  {
    id: "tiktok_ads",
    displayName: "TikTok Ads",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["ad_account:read"],
    category: "Marketing / Ads",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_campaigns", "read_ad_metrics"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a TikTok for Business developer app with Marketing API access approved.",
    description: "Read TikTok Ads campaign performance and audience insights.",
    docsUrl: "https://business-api.tiktok.com/portal/docs",
  },
  {
    id: "google_ads",
    displayName: "Google Ads",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    category: "Marketing / Ads",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_campaigns", "read_ad_metrics", "read_keywords"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a Google Ads Manager Account (MCC) and an approved Developer Token. Test accounts have limited reporting access.",
    description: "Query campaign spend, impressions, and conversions from Google Ads.",
    docsUrl: "https://developers.google.com/google-ads/api/docs/start",
  },
  {
    id: "linkedin_ads",
    displayName: "LinkedIn Ads",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["r_ads", "r_ads_reporting"],
    category: "Marketing / Ads",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_campaigns", "read_ad_metrics"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Connecting user must have Campaign Manager Admin or Sponsored Content Poster role on the ad account.",
    description: "Read LinkedIn Campaign Manager metrics and audience data.",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing",
  },
  {
    id: "klaviyo",
    displayName: "Klaviyo",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Marketing / Ads",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_flows", "read_lists", "read_metrics", "trigger_event"],
    connectionMethod: "api_key_form",
    credentialLabel: "Private API Key",
    setupNotes:
      "Use a Private API Key (not the Public API Key). Scopes are configured when generating the key in Klaviyo settings.",
    description: "Read flows, lists, and metrics; trigger events in Klaviyo.",
    docsUrl: "https://developers.klaviyo.com/en/reference/api-overview",
  },
  {
    id: "mailchimp",
    displayName: "Mailchimp",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Marketing / Ads",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_campaigns", "read_lists", "read_subscribers"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Key",
    setupNotes:
      "API key is scoped to the full account. Use OAuth for multi-account SaaS integrations where users connect their own Mailchimp accounts.",
    description: "Read campaigns, lists, and subscriber data from Mailchimp.",
    docsUrl: "https://mailchimp.com/developer/marketing/api",
  },

  // ── CRM / Sales ────────────────────────────────────────────────────────────

  {
    id: "hubspot",
    displayName: "HubSpot",
    authTypes: ["oauth2", "api_key"],
    preferredAuthType: "oauth2",
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    category: "CRM / Sales",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_contacts", "create_contact", "read_deals", "create_deal"],
    connectionMethod: "oauth_redirect",
    credentialLabel: "Private App Access Token",
    setupNotes:
      "For single-portal use, create a Private App in HubSpot and use its access token instead of OAuth. OAuth is required for multi-tenant marketplace apps.",
    description: "Read and create contacts, deals, and companies in HubSpot CRM.",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
  },
  {
    id: "salesforce",
    displayName: "Salesforce",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["api", "refresh_token"],
    category: "CRM / Sales",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_records", "create_record", "update_record", "run_soql"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Requires a Connected App with OAuth enabled in Salesforce Setup. Sandbox and production orgs use different login endpoints — configure accordingly.",
    description: "Query and update Salesforce records via SOQL and the REST API.",
    docsUrl: "https://developer.salesforce.com/docs/apis",
  },
  {
    id: "pipedrive",
    displayName: "Pipedrive",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "CRM / Sales",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_deals", "create_deal", "read_contacts", "update_deal"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Token",
    setupNotes:
      "API token is found in Pipedrive personal settings. Each user has their own token; use a dedicated service user account for shared integrations.",
    description: "Read and update deals, contacts, and pipeline stages in Pipedrive.",
    docsUrl: "https://developers.pipedrive.com/docs/api/v1",
  },

  // ── E-commerce / Payments ──────────────────────────────────────────────────

  {
    id: "shopify",
    displayName: "Shopify",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "E-commerce / Payments",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_orders", "read_products", "read_customers", "update_order"],
    connectionMethod: "api_key_form",
    credentialLabel: "Admin API Access Token",
    setupNotes:
      "Admin API Access Token is store-specific. Create a Custom App in the Shopify admin; do not use legacy private app credentials for new integrations.",
    description: "Read orders, products, and customer data from Shopify stores.",
    docsUrl: "https://shopify.dev/docs/api/admin-rest",
  },
  {
    id: "stripe",
    displayName: "Stripe",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "E-commerce / Payments",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_charges", "read_subscriptions", "read_customers", "read_invoices"],
    connectionMethod: "api_key_form",
    credentialLabel: "Secret Key",
    setupNotes:
      "Use a Restricted Key with only the permissions needed (e.g. read-only on charges and customers). Never use the full Secret Key in shared environments.",
    description: "Query charges, subscriptions, invoices, and customers from Stripe.",
    docsUrl: "https://stripe.com/docs/api",
  },
  {
    id: "woocommerce",
    displayName: "WooCommerce",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "E-commerce / Payments",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_orders", "read_products", "update_order", "read_customers"],
    connectionMethod: "api_key_form",
    credentialLabel: "Consumer Key + Secret",
    setupNotes:
      "REST API must be enabled in WooCommerce → Settings → Advanced → REST API. Consumer Key and Secret are generated per WordPress user.",
    description: "Read and manage orders and products in WooCommerce stores.",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs",
  },
  {
    id: "paypal",
    displayName: "PayPal",
    authTypes: ["oauth2"],
    preferredAuthType: "oauth2",
    scopes: ["https://uri.paypal.com/services/reporting/search/read"],
    category: "E-commerce / Payments",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: false,
    capabilities: ["read_transactions", "read_orders", "read_subscriptions"],
    connectionMethod: "oauth_redirect",
    setupNotes:
      "Uses client credentials OAuth (machine-to-machine). Create a REST app in the PayPal Developer Dashboard to obtain Client ID and Secret.",
    description: "Read PayPal transactions, orders, and subscription data.",
    docsUrl: "https://developer.paypal.com/api/rest",
  },

  // ── Support / Tickets ──────────────────────────────────────────────────────

  {
    id: "zendesk",
    displayName: "Zendesk",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Support / Tickets",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_tickets", "update_ticket", "create_ticket", "add_comment"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Token",
    setupNotes:
      "API token is account-wide. Prefer an agent-level service account over an admin account for least-privilege access.",
    description: "Read tickets, update statuses, and add comments in Zendesk Support.",
    docsUrl: "https://developer.zendesk.com/api-reference",
  },
  {
    id: "intercom",
    displayName: "Intercom",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Support / Tickets",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_conversations", "send_message", "read_users"],
    connectionMethod: "api_key_form",
    credentialLabel: "Access Token",
    setupNotes:
      "Access Token is workspace-scoped. Revoking it will break all connections using that token — rotate carefully.",
    description: "Read conversations and user data; send messages via Intercom.",
    docsUrl: "https://developers.intercom.com/docs",
  },
  {
    id: "freshdesk",
    displayName: "Freshdesk",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Support / Tickets",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_tickets", "update_ticket", "create_ticket"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Key",
    setupNotes:
      "API key is found in Freshdesk profile settings. Use Basic Auth with the key as the username and any non-empty string as the password.",
    description: "Query and update Freshdesk tickets and customer records.",
    docsUrl: "https://developers.freshdesk.com/api",
  },
  {
    id: "helpscout",
    displayName: "Help Scout",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Support / Tickets",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_conversations", "reply_conversation", "list_mailboxes"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Key",
    setupNotes:
      "API keys are created per Help Scout account under Your Profile → API Keys. Each key has full account access.",
    description: "Read and reply to Help Scout conversations and mailboxes.",
    docsUrl: "https://developer.helpscout.com/mailbox-api",
  },

  // ── Project / Ops ──────────────────────────────────────────────────────────

  {
    id: "asana",
    displayName: "Asana",
    authTypes: ["oauth2", "api_key"],
    preferredAuthType: "oauth2",
    scopes: ["default"],
    category: "Project / Ops",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_tasks", "create_task", "update_task", "list_projects"],
    connectionMethod: "oauth_redirect",
    credentialLabel: "Personal Access Token",
    setupNotes:
      "For single-user use, a Personal Access Token from Asana developer settings is simpler than OAuth. OAuth is required for multi-user apps.",
    description: "Read tasks and projects; create and update items in Asana.",
    docsUrl: "https://developers.asana.com/docs",
  },
  {
    id: "clickup",
    displayName: "ClickUp",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Project / Ops",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_tasks", "create_task", "update_task", "list_spaces"],
    connectionMethod: "api_key_form",
    credentialLabel: "Personal API Token",
    setupNotes:
      "Personal API Token is found in ClickUp profile → Apps. OAuth is available for public integrations that connect other users' accounts.",
    description: "Read and create tasks, lists, and spaces in ClickUp.",
    docsUrl: "https://clickup.com/api",
  },
  {
    id: "trello",
    displayName: "Trello",
    authTypes: ["api_key"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Project / Ops",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_cards", "create_card", "move_card", "list_boards"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Key + Token",
    setupNotes:
      "Trello requires both an API Key (from the Power-Up Admin Portal) and a user-level Token generated via the authorization URL. Both are needed for all requests.",
    description: "Read boards and cards; create and move cards in Trello.",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest",
  },
  {
    id: "jira",
    displayName: "Jira",
    authTypes: ["api_key", "oauth2"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Project / Ops",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "hybrid",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["read_issues", "create_issue", "update_issue", "run_jql"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Token",
    setupNotes:
      "Uses Atlassian API tokens with Basic Auth (email:token). Token is scoped to the generating account — use a service account in production.",
    description: "Query issues with JQL; create and transition Jira tickets.",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro",
  },

  // ── Generic ────────────────────────────────────────────────────────────────

  {
    id: "generic_rest_api",
    displayName: "Generic REST API",
    authTypes: ["api_key", "none"],
    preferredAuthType: "api_key",
    scopes: [],
    category: "Generic",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "direct",
    supportsRead: true,
    supportsWrite: true,
    capabilities: ["http_get", "http_post", "http_put", "http_delete"],
    connectionMethod: "api_key_form",
    credentialLabel: "API Key",
    setupNotes:
      "Provide a base URL and an API key. The key is sent as a Bearer token by default. Custom header names are not yet supported.",
    description:
      "Connect to any REST API with a base URL and API key. Bring your own endpoint.",
  },
  {
    id: "webhook",
    displayName: "Webhook",
    authTypes: ["webhook"],
    preferredAuthType: "webhook",
    scopes: [],
    category: "Generic",
    status: "planned",
    implementationStatus: "metadata_only",
    executionMode: "direct",
    supportsRead: false,
    supportsWrite: true,
    capabilities: ["receive_event"],
    connectionMethod: "webhook_inbound",
    setupNotes:
      "IQ BANDIT will generate an inbound URL. Configure your external service to POST JSON events to that URL. Signature verification is planned but not yet implemented.",
    description:
      "Receive inbound webhook events and trigger actions from any external service.",
  },
];

// ─── query helpers ─────────────────────────────────────────────────────────────

/** Returns all providers for a given category, preserving registry order. */
export function getProvidersByCategory(category: string): IntegrationProvider[] {
  return PROVIDERS.filter((p) => p.category === category);
}

/**
 * Returns the categories from CATEGORY_ORDER that have at least one provider,
 * followed by any additional categories not listed in CATEGORY_ORDER.
 */
export function getCategoriesWithProviders(): string[] {
  const present = new Set(PROVIDERS.map((p) => p.category));
  const ordered = (CATEGORY_ORDER as readonly string[]).filter((c) => present.has(c));
  const extra = [...present].filter(
    (c) => !(CATEGORY_ORDER as readonly string[]).includes(c)
  );
  return [...ordered, ...extra];
}

/** Looks up a single provider by id. Returns undefined if not found. */
export function getProvider(id: string): IntegrationProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Returns all providers matching a given status. */
export function getProvidersByStatus(status: ProviderStatus): IntegrationProvider[] {
  return PROVIDERS.filter((p) => p.status === status);
}

/** Returns all providers whose capabilities array includes the given capability. */
export function getProvidersByCapability(capability: string): IntegrationProvider[] {
  return PROVIDERS.filter((p) => p.capabilities.includes(capability));
}

// ─── registry validation ──────────────────────────────────────────────────────

/**
 * Validates all PROVIDERS entries for logical consistency.
 * Throws with a descriptive message listing all errors if any entry is misconfigured.
 *
 * Rules:
 *   - No duplicate provider IDs
 *   - authTypes must be non-empty
 *   - preferredAuthType must appear in authTypes
 *   - connectionMethod and preferredAuthType must be mutually consistent:
 *       oauth_redirect  ↔ oauth2
 *       api_key_form    ↔ api_key
 *       webhook_inbound ↔ webhook
 *       manual          ↔ none
 *   - capabilities must be non-empty when supportsRead or supportsWrite is true
 *   - docsUrl must be a syntactically valid URL when provided
 *
 * Called at module load time to fail fast in any environment.
 */
export function validateRegistry(): void {
  const errors: string[] = [];

  // ── Global: duplicate IDs ────────────────────────────────────────────────────
  const seenIds = new Set<string>();
  for (const p of PROVIDERS) {
    if (seenIds.has(p.id)) {
      errors.push(`Duplicate provider ID: "${p.id}"`);
    }
    seenIds.add(p.id);
  }

  // ── Per-provider checks ──────────────────────────────────────────────────────

  /**
   * Each connectionMethod has exactly one valid preferredAuthType.
   * This enforces the bijection so the connection UX doesn't need per-provider
   * logic to decide which credential flow to present.
   */
  const EXPECTED_AUTH: Partial<Record<ConnectionMethod, AuthType>> = {
    oauth_redirect:  "oauth2",
    api_key_form:    "api_key",
    webhook_inbound: "webhook",
    manual:          "none",
  };

  for (const p of PROVIDERS) {
    if (p.authTypes.length === 0) {
      errors.push(`[${p.id}] authTypes must not be empty`);
    }

    if (!p.authTypes.includes(p.preferredAuthType)) {
      errors.push(
        `[${p.id}] preferredAuthType "${p.preferredAuthType}" not found in authTypes [${p.authTypes.join(", ")}]`
      );
    }

    // Bidirectional: connectionMethod drives the expected preferredAuthType.
    const expectedAuth = EXPECTED_AUTH[p.connectionMethod];
    if (expectedAuth !== undefined && p.preferredAuthType !== expectedAuth) {
      errors.push(
        `[${p.id}] connectionMethod "${p.connectionMethod}" requires preferredAuthType "${expectedAuth}" (got "${p.preferredAuthType}")`
      );
    }

    // Providers that claim read/write capability must describe what they can do.
    if ((p.supportsRead || p.supportsWrite) && p.capabilities.length === 0) {
      errors.push(
        `[${p.id}] capabilities must be non-empty when supportsRead or supportsWrite is true`
      );
    }

    // docsUrl must parse as a valid absolute URL if present.
    if (p.docsUrl) {
      try {
        new URL(p.docsUrl);
      } catch {
        errors.push(`[${p.id}] docsUrl "${p.docsUrl}" is not a valid URL`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[providerRegistry] Validation failed (${errors.length} error${errors.length !== 1 ? "s" : ""}):\n` +
        errors.map((e) => `  • ${e}`).join("\n")
    );
  }
}

// Run at module load time — fail fast in any environment if the registry is inconsistent.
validateRegistry();
