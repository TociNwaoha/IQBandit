/**
 * lib/workspace.ts
 * Read and write OpenClaw workspace markdown files from ~/.openclaw/workspace/.
 * Used to inject SOUL.md, AGENTS.md, etc. into the LLM system prompt.
 */

import fs   from "fs";
import path from "path";

const WORKSPACE_DIR = path.join(
  process.env.HOME ?? "/Users/tocinwaoha",
  ".openclaw/workspace"
);

export const WORKSPACE_FILES = [
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "AGENTS.md",
  "MEMORY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
] as const;

export type WorkspaceFile = typeof WORKSPACE_FILES[number];

const ALLOWED = new Set<string>(WORKSPACE_FILES);

/** Read a workspace file. Returns null if missing or unreadable. */
export function readWorkspaceFile(name: WorkspaceFile): string | null {
  if (!ALLOWED.has(name)) return null;
  try {
    const p = path.join(WORKSPACE_DIR, name);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

/** Write a workspace file. Creates the directory if needed. */
export function writeWorkspaceFile(name: WorkspaceFile, content: string): void {
  if (!ALLOWED.has(name)) throw new Error(`Disallowed workspace file: ${name}`);
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE_DIR, name), content, "utf-8");
}

/**
 * Build the combined system prompt prefix from core workspace files.
 * Core files (always included if present): SOUL.md, IDENTITY.md, USER.md, AGENTS.md
 * Optional: MEMORY.md (enable for main sessions), TOOLS.md
 */
export function buildWorkspaceContext(opts: {
  includeMemory?: boolean;
  includeTools?:  boolean;
} = {}): string {
  const files: WorkspaceFile[] = ["SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md"];
  if (opts.includeTools)  files.push("TOOLS.md");
  if (opts.includeMemory) files.push("MEMORY.md");

  const parts: string[] = [];
  for (const f of files) {
    const content = readWorkspaceFile(f);
    if (content?.trim()) {
      parts.push(`---\n# ${f}\n\n${content.trim()}`);
    }
  }
  return parts.join("\n\n");
}
