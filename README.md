# IQ BANDIT

A self-hosted **AI gateway admin panel + chat interface** built with **Next.js + TypeScript** for **OpenAI-compatible backends** (currently integrated with **OpenClaw**).

IQ BANDIT adds the product layer on top of your gateway:

- 🔐 Auth-protected chat UI
- ⚙️ Runtime backend configuration (no constant `.env` edits)
- 🩺 Gateway health checks + connection testing
- 📈 Request logs / observability
- 🛡️ Validation, timeouts, and login rate limiting
- 🐳 Dockerized deployment support

---

## Why IQ BANDIT?

Most local/self-hosted AI gateway setups work… but feel like raw developer tooling.

IQ BANDIT gives you a **StartClaw-style experience** on top of your gateway:
- a usable interface for chat + admin operations
- live settings and status pages
- logs and debugging visibility
- safer operational defaults for a deployable MVP

---

## Features

### Core AI Chat
- ✅ Auth-protected chat route (`/api/openclaw/chat`)
- ✅ OpenAI-compatible request forwarding
- ✅ Configurable gateway URL + chat path
- ✅ Runtime-configurable default model
- ✅ Streaming/non-streaming support (based on route/client behavior)

### Admin + Integrations
- ✅ Integrations settings UI (`/settings/integrations`)
- ✅ SQLite-backed persisted settings (with env fallback)
- ✅ Test Connection action (gateway reachability check)
- ✅ Gateway token masking in API/UI (`***configured***`)

### Observability
- ✅ Request logging to SQLite (`chat_requests`)
- ✅ Logs page (`/logs`) with recent requests
- ✅ Latency + status tracking
- ✅ Clean server-side gateway request logs

### Reliability / Hardening
- ✅ Settings validation + normalization
- ✅ Upstream timeouts (chat + health probes)
- ✅ Error mapping (including timeout handling)
- ✅ Login rate limiting (IP-based)
- ✅ JWT session auth with expiration
- ✅ Production warnings for weak/placeholder secrets

### Deployment
- ✅ Multi-stage Docker build
- ✅ `.dockerignore`
- ✅ `DEPLOY.md` with local + Docker + curl verification steps

---

## Architecture

```text
Browser (Admin UI / Chat)
        │
        ▼
Next.js App (IQ BANDIT)
- Auth (JWT cookies)
- Settings UI/API
- Logs UI
- Chat proxy API
        │
        ▼
OpenClaw Gateway (local or remote)
- Auth token protected
- OpenAI-compatible endpoint(s)
        │
        ▼
LLM Provider (e.g. Anthropic via OpenClaw)
Responsibilities

IQ BANDIT = product layer (UI, auth, logs, settings, ops UX)

OpenClaw = gateway engine / routing layer

Provider = actual model backend

Tech Stack

Framework: Next.js (App Router)

Language: TypeScript

Runtime: Node.js 20+

Persistence: SQLite (logs/requests.db)

Auth: JWT session cookies

Containerization: Docker (multi-stage Alpine build)

Project Structure
app/
  api/
    auth/
      login/route.ts
      logout/route.ts
    openclaw/
      chat/route.ts
      health/route.ts
      test-connection/route.ts
    settings/
      route.ts
  officebuilding/
    page.tsx
    OfficeBuildingClient.tsx
  settings/
    page.tsx
    integrations/
      page.tsx
  logs/
    page.tsx
lib/
  auth.ts
  llm.ts
  logger.ts
  openclaw.ts
  ratelimit.ts
  settings.ts
Dockerfile
.dockerignore
DEPLOY.md
README.md
Prerequisites

Before running IQ BANDIT, make sure you have:

Node.js 20+

npm

OpenClaw installed + configured

A running OpenClaw gateway (local or remote)

OpenClaw setup (high level)

Run OpenClaw onboarding once to configure provider credentials (e.g. Anthropic), then start the gateway.

You’ll need:

gateway URL (e.g. http://127.0.0.1:19001)

gateway auth token

correct chat path (/v1/chat/completions or /chat/completions)

Quick Start (Local Development)
1) Install dependencies
npm install
2) Create .env.local

Create a .env.local file in the project root:

# Auth (required)
STARTCLAW_SESSION_SECRET=replace_with_32+_random_bytes
STARTCLAW_ADMIN_EMAIL=admin@example.com
STARTCLAW_ADMIN_PASSWORD=replace_with_strong_password

# Chat mode
STARTCLAW_CHAT_MODE=openclaw

# OpenClaw defaults (can be overridden in UI settings)
OPENCLAW_GATEWAY_URL=http://127.0.0.1:19001
OPENCLAW_GATEWAY_TOKEN=replace_with_gateway_token
OPENCLAW_CHAT_PATH=/v1/chat/completions
OPENCLAW_HEALTH_PATH=/health

# UI default model (can be overridden in UI settings)
DEFAULT_MODEL=openclaw:main
3) Generate a secure session secret
openssl rand -base64 32

Paste the output into STARTCLAW_SESSION_SECRET.

4) Start the app
npm run dev

Open:

http://localhost:3000/login

http://localhost:3000/officebuilding

Environment Variables
Variable	Required	Example	Description
STARTCLAW_SESSION_SECRET	Yes	random 32+ byte string	JWT signing secret for session cookies
STARTCLAW_ADMIN_EMAIL	Yes	admin@example.com	Admin login email
STARTCLAW_ADMIN_PASSWORD	Yes	strong password	Admin login password
STARTCLAW_CHAT_MODE	Yes	openclaw / disabled	Enables/disables chat gateway usage
OPENCLAW_GATEWAY_URL	Yes*	http://127.0.0.1:19001	Base gateway URL (fallback default)
OPENCLAW_GATEWAY_TOKEN	Yes*	hex token	Bearer token for OpenClaw (server-side only)
OPENCLAW_CHAT_PATH	Yes*	/v1/chat/completions	Chat endpoint path
OPENCLAW_HEALTH_PATH	No	/health	Health check path
DEFAULT_MODEL	Yes*	openclaw:main	Default model prefilled in UI

* These can be persisted/overridden from /settings/integrations after startup.

Runtime Settings (SQLite-backed)

IQ BANDIT reads settings from SQLite at runtime (with env fallback), so you can update backend config without constantly editing .env.local.

Integrations page

/settings/integrations

Configurable values:

STARTCLAW_CHAT_MODE (disabled / openclaw)

OPENCLAW_GATEWAY_URL

OPENCLAW_GATEWAY_TOKEN (masked in UI)

OPENCLAW_CHAT_PATH

DEFAULT_MODEL

Validation + normalization on save

STARTCLAW_CHAT_MODE must be openclaw or disabled

OPENCLAW_GATEWAY_URL must be valid http:// or https://

OPENCLAW_CHAT_PATH is normalized to start with /

DEFAULT_MODEL must be non-empty

values are trimmed / normalized before persistence

Invalid saves return:

{
  "error": "Validation failed",
  "details": ["..."]
}
Authentication & Security
Authentication

Login route: /api/auth/login

Logout route: /api/auth/logout

Session type: JWT cookie

Expiration: 7 days

Protected pages/routes: admin and gateway routes (e.g. logs/settings/chat APIs)

Security Hardening

✅ Gateway token stays server-side only

✅ Settings API masks token values (***configured***)

✅ IP-based login rate limiting (10 attempts / 5 minutes)

✅ Production warnings for weak placeholder secrets

✅ Upstream request timeouts

✅ Settings validation to reduce config mistakes

OpenClaw Gateway Integration

IQ BANDIT proxies chat requests to your OpenClaw gateway and supports OpenAI-compatible endpoints such as:

/v1/chat/completions

/chat/completions

Test Connection API

POST /api/openclaw/test-connection

Behavior:

probes /health

falls back to / if needed

uses provided or persisted URL/token

returns clear success/failure messages for the UI

Request Logging / Observability

IQ BANDIT logs chat requests to SQLite for debugging and operational visibility.

Logs page

http://localhost:3000/logs

Typical logged fields

timestamp

route

model

success/failure

status code

latency (ms)

error message (if any)

SQLite file location
logs/requests.db
Example query
sqlite3 "./logs/requests.db" \
  "SELECT id, timestamp, model, success, latency_ms, error_message FROM chat_requests ORDER BY id DESC LIMIT 5;"
Timeouts & Error Handling
Upstream timeouts

Chat requests: timeout protection (e.g. 30s)

Health/test probes: shorter timeout (e.g. 5s)

Error mapping (examples)

IQ BANDIT maps common upstream failures into clearer app-level errors:

401/403 → invalid/expired gateway token

404/405 → wrong gateway endpoint path

gateway unreachable (ECONNREFUSED)

upstream timeout

model mismatch / unavailable model

This makes debugging much faster during setup/deploy.

Docker
Build
docker build -t iq-bandit .
Run
docker run --rm -p 3000:3000 \
  -e STARTCLAW_SESSION_SECRET="$(openssl rand -base64 32)" \
  -e STARTCLAW_ADMIN_EMAIL="admin@example.com" \
  -e STARTCLAW_ADMIN_PASSWORD="change_me_now" \
  -e STARTCLAW_CHAT_MODE="openclaw" \
  -e OPENCLAW_GATEWAY_URL="http://host.docker.internal:19001" \
  -e OPENCLAW_GATEWAY_TOKEN="your_gateway_token" \
  -e OPENCLAW_CHAT_PATH="/v1/chat/completions" \
  -e DEFAULT_MODEL="openclaw:main" \
  -v "$(pwd)/logs:/app/logs" \
  iq-bandit
Notes

logs/ is mounted so SQLite data persists

On Linux, host.docker.internal may require extra setup (see DEPLOY.md)

Deployment

See DEPLOY.md
 for:

required env vars

security checklist

local and Docker deployment steps

curl verification commands

troubleshooting guidance

Verification Checklist (Smoke Test)

 Login at /login

 Test gateway connection from /settings/integrations

 Send a successful chat from /officebuilding

 Confirm request appears in /logs

 Change DEFAULT_MODEL in Integrations and confirm it pre-fills in /officebuilding

 Verify bad settings are rejected with 400 Validation failed

 Verify login rate limit returns 429 on attempt 11

Validation test example
curl -s -b cookies.txt -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"OPENCLAW_GATEWAY_URL":"not-a-url","STARTCLAW_CHAT_MODE":"badvalue"}'
Login rate-limit test example
for i in $(seq 1 11); do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}' \
    -o /dev/null -w "req $i: %{http_code}\n"
done
Troubleshooting
405 Method Not Allowed on chat

Wrong chat path is the most common cause. Try switching between:

/v1/chat/completions

/chat/completions

Update it in /settings/integrations (preferred).

401 / 403 from gateway

Usually:

wrong OPENCLAW_GATEWAY_TOKEN

rotated/expired token

auth mismatch in gateway config

Re-run Test Connection in Integrations.

ECONNREFUSED / gateway unreachable

Check:

gateway is running

correct port (19001 vs 19004, etc.)

Docker networking if containerized

Timeouts

Possible causes:

gateway overloaded

provider unavailable

wrong model

network issue between IQ BANDIT and gateway

Chat disabled

Check STARTCLAW_CHAT_MODE in /settings/integrations is set to openclaw.

SQLite errors

Check:

logs/ exists and is writable

container volume mount is correct

file permissions allow writes to requests.db

Screenshots (Recommended for Portfolio / Demo)

Add these to make the repo stand out:

Chat UI (/officebuilding)

a conversation in progress

config panel open

Logs (/logs)

recent requests table with status + latency + model

Settings status (/settings)

gateway card with green status

endpoint, chat path, default model, mode

Integrations (/settings/integrations)

populated config form

token masked as ***configured***

successful “Connected” test status

Roadmap Ideas

Provider presets (OpenClaw / OpenAI / OpenRouter / Ollama / vLLM)

Multi-user auth / RBAC

Usage analytics charts

Export/import settings

Request replay tools

Team audit logs

Streaming UX polish (cancel/retry/resume)

Deploy wizard for common backends

Credits

Built as a product layer for an OpenAI-compatible gateway workflow

Integrated with OpenClaw as the gateway engine

Author

Toci Nwaoha
IQ BANDIT

License

Choose your preferred license (MIT / Apache-2.0 / Proprietary). Example:

MIT License
