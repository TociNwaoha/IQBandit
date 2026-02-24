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
| `NEXT_PUBLIC_APP_URL` | No | Public URL of this app | `https://yourapp.example.com` |
| `OPENCLAW_CHAT_PATH` | No | Override chat endpoint path | `/v1/chat/completions` |
| `OPENCLAW_HEALTH_PATH` | No | Override health endpoint path | `/health` |

Generate the session secret:
```bash
openssl rand -base64 32
```

Find the gateway token in `~/.openclaw/openclaw.json` under `gateway.auth.token`.

---

## Security Checklist

Before going live, verify **all** of these:

- [ ] `STARTCLAW_ADMIN_PASSWORD` is **not** `changeme_strong_password`
- [ ] `STARTCLAW_SESSION_SECRET` is **not** `replace_with_32+_random_bytes` and is at least 32 characters
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

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -m json.tool
# Expected: {"success":true}
```

### 2. Gateway health check

```bash
curl -s -b cookies.txt http://localhost:3000/api/openclaw/health | python3 -m json.tool
# Expected: {"status":"ok",...}
```

### 3. Non-streaming chat

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/openclaw/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw:main","messages":[{"role":"user","content":"Say hi"}]}' \
  | python3 -m json.tool
# Expected: OpenAI-compatible JSON with choices[0].message.content
```

### 4. Settings page (read)

```bash
curl -s -b cookies.txt http://localhost:3000/api/settings | python3 -m json.tool
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
curl -s -b cookies.txt -X POST http://localhost:3000/api/settings \
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
