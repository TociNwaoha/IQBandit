/**
 * lib/mcp/stdioClient.ts
 *
 * Minimal stdio MCP client — spawns a local MCP server process and
 * communicates over stdin/stdout using JSON-RPC 2.0 line-delimited framing.
 *
 * Features:
 *  - initialize / initialized handshake
 *  - callTool(name, args) → typed result
 *  - 30-second per-request timeout
 *  - Module-level singleton; the process is re-spawned automatically if it dies
 *  - Env vars consumed:
 *      MCP_GMAIL_COMMAND           – default "npx"
 *      MCP_GMAIL_ARGS              – comma-separated args (e.g. "tsx,/path/to/index.ts")
 *      MCP_GMAIL_ENV_<KEY>=<VALUE> – forwarded into the child process environment
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface }          from "node:readline";
import { randomUUID }               from "node:crypto";

// ── JSON-RPC types ────────────────────────────────────────────────────────────

interface RpcRequest {
  jsonrpc: "2.0";
  id:      string;
  method:  string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id:      string;
  result?: unknown;
  error?:  { code: number; message: string; data?: unknown };
}

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject:  (err: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
};

// ── StdioMcpClient ────────────────────────────────────────────────────────────

const CALL_TIMEOUT_MS = 30_000;

export class StdioMcpClient {
  private proc:       ChildProcess;
  private pending     = new Map<string, PendingResolver>();
  private _initialized = false;
  private _dead        = false;

  constructor(command: string, args: string[], env?: Record<string, string>) {
    this.proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env:   { ...process.env, ...env },
      shell: false,
    });

    // Line-by-line stdout reader (responses from MCP server)
    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => this.handleLine(line.trim()));

    // Forward MCP server stderr to host stderr with a prefix for easy tracing
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trimEnd();
      text.split("\n").forEach((l) => {
        if (l.trim()) process.stderr.write(`[MCP-Gmail] ${l}\n`);
      });
    });

    // Handle clean exit / crash
    this.proc.on("exit", (code, signal) => {
      this._dead = true;
      const why  = signal ? `signal ${signal}` : `code ${String(code ?? "?")}`;
      console.error(`[MCP-Gmail] Process exited (${why})`);
      this.rejectAll(`MCP process exited (${why})`);
    });

    this.proc.on("error", (err) => {
      this._dead = true;
      console.error(`[MCP-Gmail] Spawn error: ${err.message}`);
      this.rejectAll(err.message);
    });
  }

  // ── Public state ───────────────────────────────────────────────────────────

  get isAlive(): boolean { return !this._dead; }

  destroy(): void {
    this._dead = true;
    try { this.proc.kill("SIGTERM"); } catch { /* already dead */ }
  }

  // ── MCP initialize handshake ───────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this._initialized) return;
    await this.call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities:    {},
      clientInfo:      { name: "iq-bandit", version: "0.1.0" },
    });
    // `initialized` is a notification — no id, no response expected
    this.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    this._initialized = true;
    console.error("[MCP-Gmail] Handshake complete");
  }

  // ── Tool invocation ────────────────────────────────────────────────────────

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this._dead) {
      throw new Error("MCP Gmail process is not running. Check MCP_GMAIL_ARGS and run `npm run oauth` in the mcp-gmail folder.");
    }
    await this.initialize();
    return this.call("tools/call", { name, arguments: args });
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private write(msg: object): void {
    this.proc.stdin?.write(JSON.stringify(msg) + "\n");
  }

  private call(method: string, params?: unknown): Promise<unknown> {
    if (this._dead) {
      return Promise.reject(new Error("MCP process is dead"));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out after ${CALL_TIMEOUT_MS / 1000}s: ${method}`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params } satisfies RpcRequest);
    });
  }

  private handleLine(line: string): void {
    if (!line) return;

    let msg: RpcResponse;
    try {
      msg = JSON.parse(line) as RpcResponse;
    } catch {
      // Non-JSON line from the MCP process (e.g. startup logs) — ignore
      return;
    }

    // Notifications have no id — nothing to resolve
    if (!msg.id) return;

    const resolver = this.pending.get(msg.id);
    if (!resolver) return;

    this.pending.delete(msg.id);
    clearTimeout(resolver.timer);

    if (msg.error) {
      resolver.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
    } else {
      resolver.resolve(msg.result);
    }
  }

  private rejectAll(reason: string): void {
    for (const [, r] of this.pending) {
      clearTimeout(r.timer);
      r.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────
// One MCP Gmail process per Next.js server process.
// Automatically re-spawned when the previous instance dies.

let _client: StdioMcpClient | null = null;

/**
 * Parse MCP Gmail server config from environment variables.
 *
 *   MCP_GMAIL_COMMAND           – binary to run (default: "npx")
 *   MCP_GMAIL_ARGS              – comma-separated args (default: "")
 *   MCP_GMAIL_ENV_<KEY>         – forwarded into the child env as <KEY>=value
 *
 * Example .env.local:
 *   MCP_GMAIL_COMMAND=npx
 *   MCP_GMAIL_ARGS=tsx,/Users/you/Projects/mcp-gmail/src/index.ts
 *   MCP_GMAIL_ENV_GMAIL_CLIENT_ID=xxx
 *   MCP_GMAIL_ENV_GMAIL_CLIENT_SECRET=xxx
 *   MCP_GMAIL_ENV_TOKEN_DB_PATH=/Users/you/Projects/mcp-gmail/tokens.json
 */
function getMcpGmailConfig(): { command: string; args: string[]; env: Record<string, string> } {
  const command = process.env.MCP_GMAIL_COMMAND ?? "npx";
  const rawArgs = process.env.MCP_GMAIL_ARGS    ?? "";
  const args    = rawArgs.split(",").map((a) => a.trim()).filter(Boolean);

  // Collect MCP_GMAIL_ENV_* forwarded env vars
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("MCP_GMAIL_ENV_") && val !== undefined) {
      env[key.slice("MCP_GMAIL_ENV_".length)] = val;
    }
  }

  return { command, args, env };
}

/**
 * Returns whether the MCP Gmail server is configured via environment variables.
 * Used as a lightweight proxy for "is Gmail accessible via MCP?" without
 * making a live tool call on every request.
 */
export function isMcpGmailConfigured(): boolean {
  return Boolean(process.env.MCP_GMAIL_ARGS?.trim());
}

/**
 * Returns the shared MCP Gmail client, spawning (or re-spawning) the
 * subprocess if it isn't currently alive.
 *
 * Call sites should be prepared for the first call to be slow while the
 * MCP server process starts up (~1–2 s). Subsequent calls reuse the process.
 */
export function getOrCreateMcpGmailClient(): StdioMcpClient {
  if (_client?.isAlive) return _client;

  // Tear down dead client if any
  if (_client) {
    _client.destroy();
    _client = null;
  }

  const { command, args, env } = getMcpGmailConfig();
  console.error(`[MCP-Gmail] Spawning: ${command} ${args.join(" ")}`);
  _client = new StdioMcpClient(command, args, env);
  return _client;
}
