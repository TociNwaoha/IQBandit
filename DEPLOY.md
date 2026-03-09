# Deployment Guide — IQ BANDIT (FRONTEND)

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20 LTS | 18+ works but 20 recommended |
| npm | 10+ | ships with Node 20 |
| OpenClaw gateway | any | must be running before the app starts |

OpenClaw must be configured and running before accepting chat requests.
Run `openclaw onboard` once to set up the Anthropic API key, then start the gateway:

```bash
openclaw gateway        # starts on default port (19001)
```

Verify it's up:
```bash
curl http://127.0.0.1:19001/health
```

---

## Required Environment Variables

Create a `.env.production` file (or pass vars via `-e` flags in Docker). **Never commit this file.**

| Variable | Required | How to generate | Example |
|----------|----------|-----------------|---------|
| `STARTCLAW_ADMIN_EMAIL` | Yes | Choose your login email | `you@company.com` |
| `STARTCLAW_ADMIN_PASSWORD` | Yes | Strong password (16+ chars) | *(random, unique)* |
| `STARTCLAW_SESSION_SECRET` | Yes | `openssl rand -base64 32` | *(32+ random bytes)* |
| `OPENCLAW_GATEWAY_URL` | Yes | URL where OpenClaw listens | `http://127.0.0.1:19001` |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Token from `~/.openclaw/openclaw.json` | *(hex string)* |
| `STARTCLAW_CHAT_MODE` | No | `openclaw` or `disabled` | `openclaw` |
| `INTEGRATIONS_ENCRYPTION_SECRET` | Yes (if using integrations) | `openssl rand -base64 32` | *(32+ random bytes)* |
| `NEXT_PUBLIC_APP_URL` | No | Public URL of this app | `https://yourapp.example.com` |
| `OPENCLAW_CHAT_PATH` | No | Override chat endpoint path | `/v1/chat/completions` |
| `OPENCLAW_HEALTH_PATH` | No | Override health endpoint path | `/health` |

Generate the session secret:
```bash
openssl rand -base64 32
```

Find the gateway token in `~/.openclaw/openclaw.json` under `gateway.auth.token`.

### Notion OAuth (optional)

To enable the Notion integration:

1. Go to https://www.notion.com/my-integrations and click **+ New integration**.
2. Choose **Public** type (required for OAuth). Set a name and logo.
3. Under **OAuth Domain & URIs**, add your redirect URI:
   - Local dev: `http://localhost:3000/api/integrations/oauth/notion/callback`
   - Production: `https://yourdomain.com/api/integrations/oauth/notion/callback`
4. Copy the **OAuth client ID** and **OAuth client secret** from the integration page.
5. Add to your environment:

```bash
NOTION_CLIENT_ID=your_client_id_here
NOTION_CLIENT_SECRET=your_client_secret_here
NOTION_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/oauth/notion/callback
```

6. Restart the server. The "Connect via OAuth" button on the Notion card at `/integrations` will become active.

**Important:** Notion tokens don't expire and there is no refresh token. Revoking the integration in Notion's settings immediately invalidates the stored token — reconnect via `/integrations` to restore access.

### Meta Ads OAuth (optional)

To enable the Meta Ads integration:

1. Go to https://developers.facebook.com/apps and click **Create App** → choose **Business** type.
2. From the App Dashboard, go to **Products → Facebook Login → Settings**.
3. Under **Valid OAuth Redirect URIs**, add your redirect URI:
   - Local dev: `http://localhost:3000/api/integrations/oauth/meta/callback`
   - Production: `https://yourdomain.com/api/integrations/oauth/meta/callback`
4. Copy the **App ID** and **App Secret** from **Settings → Basic**.
5. Add to your environment:

```bash
META_APP_ID=your_app_id_here
META_APP_SECRET=your_app_secret_here
META_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/oauth/meta/callback
```

6. Restart the server. The "Connect via OAuth" button on the Meta Ads card will become active.

**Permissions:** The integration requests `ads_read`. For development, this works immediately in Meta's test mode. For production apps used outside your own Meta account, request `ads_read` via App Review in the Meta App Dashboard.

**Token lifecycle:** The callback automatically exchanges the short-lived token (~1–2 hours) for a long-lived token (~60 days). When the token expires, the connection status becomes `expired` — reconnect via `/integrations` to get a fresh token. There is no automatic refresh.

### Gmail OAuth (optional)

To enable the Gmail read-only integration:

1. Go to https://console.cloud.google.com/apis/library and enable the **Gmail API** for your project.
2. Go to https://console.cloud.google.com/apis/credentials and click **Create Credentials → OAuth client ID**.
3. Choose **Web application**. Under **Authorised redirect URIs**, add:
   - Local dev: `http://localhost:3000/api/integrations/oauth/gmail/callback`
   - Production: `https://yourdomain.com/api/integrations/oauth/gmail/callback`
4. Copy the **Client ID** and **Client Secret** from the credentials page.
5. Add to your environment:

```bash
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/oauth/gmail/callback
```

6. Restart the server. The "Connect via OAuth" button on the Gmail card at `/integrations` will become active.

**Scope:** The integration requests `gmail.readonly` only — no write access. Emails are never stored on the server; each tool call fetches live data from the Gmail API.

**Token lifecycle:** Gmail issues short-lived access tokens (~1 hour) paired with a long-lived refresh token. The server refreshes the access token automatically on expiry — no user action required. If the refresh token is revoked (e.g. via Google Account security settings), the connection status flips to `expired` — reconnect via `/integrations` to restore access.

**OAuth app verification:** While in development, add test users in the Google Cloud Console (OAuth consent screen → Test users). Apps requesting `gmail.readonly` that are published beyond test users require Google's OAuth verification process.

---

## Security Checklist

Before going live, verify **all** of these:

- [ ] `STARTCLAW_ADMIN_PASSWORD` is **not** `changeme_strong_password`
- [ ] `STARTCLAW_SESSION_SECRET` is **not** `replace_with_32+_random_bytes` and is at least 32 characters
- [ ] `INTEGRATIONS_ENCRYPTION_SECRET` is set and is **not** `replace_with_32+_random_bytes` (required before connecting any provider)
- [ ] `STARTCLAW_ADMIN_EMAIL` is not `admin@example.com` (unless that's your real address)
- [ ] `.env.production` / `.env.local` is in `.gitignore` and never committed
- [ ] `logs/` directory is not committed (contains request history with user emails)
- [ ] OpenClaw gateway token is rotated from any demo/test value

If you see `[SECURITY]` warnings in server logs, the app will still run but those warnings must be
resolved before the server is accessible to anyone besides you.

---

## Local Development

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

App starts at http://localhost:3000.

---

## Production — Bare Node.js

```bash
# 1. Install production dependencies (compiles better-sqlite3 native addon)
npm ci --omit=dev

# 2. Build the Next.js app
npm run build

# 3. Set env vars (or use a .env file + dotenv-cli / systemd EnvironmentFile)
export STARTCLAW_ADMIN_EMAIL=you@company.com
export STARTCLAW_ADMIN_PASSWORD=your_strong_password
export STARTCLAW_SESSION_SECRET=$(openssl rand -base64 32)
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:19001
export OPENCLAW_GATEWAY_TOKEN=your_gateway_token
export STARTCLAW_CHAT_MODE=openclaw
export NODE_ENV=production

# 4. Start
npm start
```

The server listens on port 3000 by default. Use a reverse proxy (nginx, Caddy) to terminate TLS
and forward traffic to `127.0.0.1:3000`.

---

## Production — Docker

### Build

```bash
docker build -t iqbandit .
```

The build takes 2–5 minutes on first run (compiles `better-sqlite3` from source for Alpine/musl).
Subsequent builds use Docker's layer cache and are much faster.

### Run

```bash
docker run -d \
  --name iqbandit \
  -p 3000:3000 \
  -e STARTCLAW_ADMIN_EMAIL=you@company.com \
  -e STARTCLAW_ADMIN_PASSWORD=your_strong_password \
  -e STARTCLAW_SESSION_SECRET="$(openssl rand -base64 32)" \
  -e OPENCLAW_GATEWAY_URL=http://host.docker.internal:19001 \
  -e OPENCLAW_GATEWAY_TOKEN=your_gateway_token \
  -e STARTCLAW_CHAT_MODE=openclaw \
  -e NODE_ENV=production \
  -v "$(pwd)/logs:/app/logs" \
  iqbandit
```

Notes:
- `host.docker.internal` resolves to the Docker host's loopback address on macOS/Windows.
  On Linux, use `--add-host=host.docker.internal:host-gateway` or the host's LAN IP.
- `-v ./logs:/app/logs` mounts a local directory for persistent request logs and SQLite settings.
  Without this mount, logs are lost when the container is replaced.

### Using an env file

```bash
# Create .env.production with all required vars (one KEY=VALUE per line)
docker run -d --name iqbandit -p 3000:3000 \
  --env-file .env.production \
  -v "$(pwd)/logs:/app/logs" \
  iqbandit
```

---

## Verification Commands

Run these after starting the server to confirm everything is wired up correctly.
Replace `$EMAIL` and `$PASS` with your `STARTCLAW_ADMIN_*` values.

### 1. Login and save session cookie

> **`-c` WRITES cookies, `-b` READS cookies.** Using `-b` during login is the most
> common reason the session cookie never gets saved. Also: if you edit `.env.local`
> you **must restart `npm run dev`** — Next.js only reads env vars at startup.

```bash
BASE=http://localhost:3000
COOKIE_JAR="$HOME/iqbandit-cookies.txt"

# Login — use -c to WRITE the session cookie to COOKIE_JAR.
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme_strong_password"}'
# Expected: {"success":true}
# Wrong password → {"error":"Invalid credentials"} — check STARTCLAW_ADMIN_EMAIL /
# STARTCLAW_ADMIN_PASSWORD in .env.local, then restart npm run dev.

# Confirm the cookie was actually written:
grep iqbandit_session "$COOKIE_JAR" && echo "cookie present" || echo "MISSING — re-run login"
```

### 1a. Cookie sanity check (dev only)

The debug endpoint requires two opt-in gates — add to `.env.local`:
```
ENABLE_DEBUG_ENDPOINTS=true
```
Then restart `npm run dev` and run:

```bash
BASE=http://localhost:3000
COOKIE_JAR="$HOME/iqbandit-cookies.txt"

# Use -b to READ the cookie and hit the debug endpoint.
curl -s -b "$COOKIE_JAR" "$BASE/api/debug/session"
# Expected: {"authed":true,"email":"admin@example.com"}
#
# 401 {"authed":false}  → cookie is missing or expired; re-run login step with -c
# 404 (empty body)      → ENABLE_DEBUG_ENDPOINTS is not set, or NODE_ENV=production
# 500                   → server error; check npm run dev console
```

All remaining examples in this file use `$BASE` and `$COOKIE_JAR` — set them once
at the top of your terminal session.

### 2. Gateway health check

```bash
curl -s -b "$COOKIE_JAR" http://localhost:3000/api/openclaw/health | python3 -m json.tool
# Expected: {"status":"ok",...}
```

### 3. Non-streaming chat

```bash
curl -s -b "$COOKIE_JAR" -X POST http://localhost:3000/api/openclaw/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw:main","messages":[{"role":"user","content":"Say hi"}]}' \
  | python3 -m json.tool
# Expected: OpenAI-compatible JSON with choices[0].message.content
```

### 4. Settings page (read)

```bash
curl -s -b "$COOKIE_JAR" http://localhost:3000/api/settings | python3 -m json.tool
# Expected: current settings with token masked as "***configured***"
```

### 5. Login rate-limit (should trigger 429 on attempt 11)

```bash
for i in $(seq 1 11); do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"wrong@test.com","password":"wrong"}' \
    -o /dev/null -w "req $i: %{http_code}\n"
done
# Expected: requests 1–10 → 401, request 11 → 429
```

### 6. Settings validation (should reject bad URL)

```bash
curl -s -b "$COOKIE_JAR" -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"OPENCLAW_GATEWAY_URL":"not-a-url","STARTCLAW_CHAT_MODE":"badvalue"}' \
  | python3 -m json.tool
# Expected: 400 with {"error":"Validation failed","details":[...]}
```

### 7. Query request logs

```bash
# Via the web UI:
open http://localhost:3000/logs

# Via SQLite directly:
sqlite3 logs/requests.db \
  "SELECT id, timestamp, email, model, success, latency_ms FROM chat_requests ORDER BY id DESC LIMIT 10;"
```

---

## Integrations API

All integration routes require a valid session cookie.
Run the login step (verification #1 above) first, then set these shell vars once:

```bash
BASE=http://localhost:3000
COOKIE_JAR="$HOME/iqbandit-cookies.txt"
```

### List all providers

```bash
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/providers" | python3 -m json.tool
# Expected: {"providers":[...]} — full registry, no secrets
```

Filter by status or category:
```bash
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/providers?status=live" | python3 -m json.tool
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/providers?category=Communication" | python3 -m json.tool
# Invalid status → 400: {"error":"Invalid status: \"bad\". Must be one of: planned, beta, live"}
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/providers?status=bad" | python3 -m json.tool
```

### Connect a provider with an API key (Discord example)

Discord uses `api_key_form` / `api_key` auth. Replace `YOUR_BOT_TOKEN` with a real token.

```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id":   "discord",
    "auth_type":     "api_key",
    "access_token":  "YOUR_BOT_TOKEN",
    "account_label": "My Discord Server"
  }' | python3 -m json.tool
# Expected: {"connection":{"id":"...","provider_id":"discord","status":"connected",
#            "has_access_token":true,"has_refresh_token":false,...}}
# Note: access_token is NOT echoed back — only has_access_token: true
```

auth_type defaults to the provider's preferredAuthType if omitted:
```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"discord","access_token":"YOUR_BOT_TOKEN"}' | python3 -m json.tool
# Same result — auth_type defaults to "api_key" for discord
```

### List connections (masked — no tokens in response)

```bash
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/connections" | python3 -m json.tool
# Expected: {"connections":[{"provider_id":"discord","status":"connected",
#            "has_access_token":true,...}]}
# Tokens are NEVER returned — only boolean presence flags
```

### Disconnect a provider

```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/disconnect" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"discord"}' | python3 -m json.tool
# Expected: {"ok":true}
# After disconnect: status="disconnected", tokens wiped, expires_at cleared
```

### Error cases

**Missing encryption secret** (INTEGRATIONS_ENCRYPTION_SECRET not set):
```bash
# Unset the env var, then try to connect — server returns 500
# Expected: {"error":"[integrations/crypto] INTEGRATIONS_ENCRYPTION_SECRET is not set..."}
```

**Unknown provider_id:**
```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"does_not_exist","access_token":"tok"}' | python3 -m json.tool
# Expected: 400 {"error":"Unknown provider: \"does_not_exist\""}
```

**auth_type not supported by provider:**
```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"discord","auth_type":"oauth2","access_token":"tok"}' | python3 -m json.tool
# Expected: 400 {"error":"auth_type \"oauth2\" is not supported by provider \"discord\". Allowed: [api_key]"}
```

**Tokens sent to a webhook provider:**
```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"webhook","access_token":"tok"}' | python3 -m json.tool
# Expected: 400 {"error":"Provider \"webhook\" uses webhook_inbound and does not accept access or refresh tokens"}
```

**Unknown field in body:**
```bash
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/connections" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"discord","access_token":"tok","suspicious_field":"x"}' | python3 -m json.tool
# Expected: 400 {"error":"Unknown field(s): \"suspicious_field\""}
```

**Unauthenticated request:**
```bash
curl -s -X GET "$BASE/api/integrations/connections" | python3 -m json.tool
# Expected: 401 {"error":"Unauthorized"}
```

### Notion search (after connecting)

```bash
# List recent pages (no query = most recently edited)
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/notion/search" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
# Expected: {"results":[{"id":"...","object":"page","title":"...","url":"...","last_edited_time":"..."}],"has_more":false,"next_cursor":null}

# Search with query and limit
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/notion/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"marketing plan","limit":5}' | python3 -m json.tool

# Not connected → 409
# Expected: {"error":"Notion is not connected. Go to /integrations to connect it."}

# Invalid limit → 400
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/notion/search" \
  -H "Content-Type: application/json" \
  -d '{"limit":999}' | python3 -m json.tool
# Expected: 400 {"error":"\"limit\" must be between 1 and 100"}
```

### Meta Ads (after connecting)

```bash
# List ad accounts accessible to the token
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/meta/accounts" | python3 -m json.tool
# Expected: {"accounts":[{"id":"act_123456789","name":"My Ad Account","status":1,"currency":"USD","timezone_name":"America/New_York"}],"has_more":false,"next_cursor":null}

# List ad accounts with custom limit
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/meta/accounts?limit=10" | python3 -m json.tool

# List campaigns for an ad account
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"act_123456789","limit":10}' | python3 -m json.tool
# Expected: {"campaigns":[{"id":"...","name":"Summer Sale","status":"ACTIVE","objective":"LINK_CLICKS","budget_remaining":"5000","daily_budget":"1000","lifetime_budget":null}],"has_more":false,"next_cursor":null}

# Accepts ID with or without act_ prefix
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"123456789"}' | python3 -m json.tool

# Get campaign-level insights for last 30 days (default)
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/insights" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"act_123456789"}' | python3 -m json.tool
# Expected: {"insights":[{"campaign_id":"...","campaign_name":"Summer Sale","date_start":"2025-12-25","date_stop":"2026-01-24","impressions":"12500","clicks":"340","spend":"87.50","reach":"9800","ctr":"2.72","cpc":"0.257","cpm":"7.00"}],"has_more":false,"next_cursor":null}

# Custom date range + account-level aggregation
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/insights" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"act_123456789","level":"account","date_start":"2026-01-01","date_end":"2026-01-31"}' | python3 -m json.tool

# Ad-set level insights for last 7 days with custom fields
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/insights" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"act_123456789","level":"adset","date_preset":"last_7d","fields":["impressions","clicks","spend","cpm"]}' | python3 -m json.tool

# Invalid ad_account_id → 400
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"not-a-number"}' | python3 -m json.tool
# Expected: 400 {"error":"\"ad_account_id\" must be a numeric ID"}

# Mutually exclusive date params → 400
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/meta/insights" \
  -H "Content-Type: application/json" \
  -d '{"ad_account_id":"act_123456789","date_preset":"last_7d","date_start":"2026-01-01"}' | python3 -m json.tool
# Expected: 400 {"error":"\"date_preset\" and \"date_start\"/\"date_end\" are mutually exclusive"}

# Not connected → 409
# Expected: {"error":"Meta Ads is not connected. Go to /integrations to connect it."}
```

### Gmail OAuth smoke test

Complete this before the "Gmail (after connecting)" section to wire up the connection.

**Step 1 — Verify start route is configured** (curl only, no browser needed):

```bash
# This should return HTTP 307 → accounts.google.com if env vars are set correctly.
# If it returns 500 with {"code":"GMAIL_OAUTH_NOT_CONFIGURED","missing":[...]}, add
# the listed vars to .env.local and restart the dev server.
curl -s -b "$COOKIE_JAR" \
  -o /dev/null -w "HTTP %{http_code}  redirect → %{redirect_url}\n" \
  "$BASE/api/integrations/oauth/gmail/start"
# Expected: HTTP 307  redirect → https://accounts.google.com/o/oauth2/v2/auth?...
```

**Step 2 — Complete the OAuth flow in a browser**:

1. Open `http://localhost:3000/integrations` in a browser (log in first).
2. The Gmail card shows an enabled "Connect via OAuth" button (only if env vars are set).
3. Click it → redirected to Google consent screen → approve → redirected back to
   `/integrations?connected=gmail` with a green "Connected to gmail successfully." banner.

**Step 3 — Verify tokens were stored** (real DB columns, not derived fields):

```bash
sqlite3 logs/requests.db "
  SELECT provider_id, status, account_label, auth_type,
         CASE WHEN access_token_enc  != '' THEN 'YES' ELSE 'NO' END AS has_token,
         CASE WHEN refresh_token_enc != '' THEN 'YES' ELSE 'NO' END AS has_refresh,
         expires_at, updated_at
  FROM tool_connections WHERE provider_id = 'gmail';
"
# Expected: gmail | connected | user@gmail.com | oauth2 | YES | YES | 2026-... | ...
# Note: access_token_enc / refresh_token_enc are the real DB columns.
#       The API returns has_access_token / has_refresh_token (derived booleans) — never raw tokens.
```

**Step 4 — End-to-end API call** (token refresh handled automatically):

```bash
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/gmail/labels" | python3 -m json.tool
# Expected: {"result":{"labels":[{"id":"INBOX","name":"INBOX","type":"system"},...]}}
```

### Gmail (after connecting)

```bash
# List all Gmail labels
curl -s -b "$COOKIE_JAR" "$BASE/api/integrations/gmail/labels" | python3 -m json.tool
# Expected: {"result":{"labels":[{"id":"INBOX","name":"INBOX","type":"system"},...]}}

# Search messages
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/gmail/search" \
  -H "Content-Type: application/json" \
  -d '{"q":"from:boss@company.com is:unread","maxResults":10}' | python3 -m json.tool
# Expected: {"result":{"messages":[{"id":"...","threadId":"..."}],"resultSizeEstimate":3}}

# Fetch a message (metadata format — headers only, no body)
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/gmail/message" \
  -H "Content-Type: application/json" \
  -d '{"id":"<message_id_from_search>"}' | python3 -m json.tool
# Expected: {"result":{"id":"...","threadId":"...","snippet":"...","payload":{"headers":[...]}}}

# Fetch a message with full body
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/gmail/message" \
  -H "Content-Type: application/json" \
  -d '{"id":"<message_id>","format":"full"}' | python3 -m json.tool

# Via the generic execute endpoint (agent-aware)
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/integrations/execute" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"gmail","action":"search_messages","input":{"q":"subject:invoice","maxResults":5}}' \
  | python3 -m json.tool
# Expected: {"result":{"messages":[...],"resultSizeEstimate":2}}

# Not connected → 409
# Expected: {"error":"Gmail is not connected. Go to /integrations to connect it.","code":"PROVIDER_NOT_CONNECTED"}
```

### Inspect connections directly via SQLite

```bash
sqlite3 logs/requests.db \
  "SELECT provider_id, status, account_label, auth_type,
          CASE WHEN access_token_enc != '' THEN 'YES' ELSE 'NO' END AS has_token,
          updated_at
   FROM tool_connections ORDER BY updated_at DESC;"
```

Note: `access_token_enc` and `refresh_token_enc` columns contain AES-256-GCM ciphertext.
They are never readable without `INTEGRATIONS_ENCRYPTION_SECRET`. Do not commit `logs/requests.db`.

---

## Persistent Data

All persistent data lives in `logs/` (SQLite database):

| File | Contents |
|------|---------|
| `logs/requests.db` | Chat request log + gateway settings (two tables) |
| `logs/requests.ndjson` | Fallback log if SQLite unavailable |

Back up `logs/requests.db` to preserve request history and any settings saved via
`/settings/integrations`. In Docker, this is handled by the `-v ./logs:/app/logs` mount.

---

## Updating

```bash
# Pull new code
git pull

# Rebuild (Docker)
docker build -t iqbandit .
docker stop iqbandit && docker rm iqbandit
docker run -d ... iqbandit   # same run command as above

# Or bare Node.js
npm ci --omit=dev
npm run build
# restart the process (systemd: systemctl restart iqbandit)
```

Settings saved in SQLite persist across updates as long as `logs/` is preserved.
