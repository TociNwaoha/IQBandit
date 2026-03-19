/**
 * lib/ssh.ts
 * SSH client for executing commands on the Contabo VPS.
 * Creates a fresh connection per call — no persistent connections, no leaks.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import { Client } from "ssh2";

// ─── config ───────────────────────────────────────────────────────────────────

function getSSHConfig(): { host: string; username: string; privateKey: Buffer } {
  const host = process.env.VPS_HOST;
  const username = process.env.VPS_SSH_USER ?? "root";
  const privateKeyB64 = process.env.VPS_SSH_PRIVATE_KEY;

  if (!host) throw new Error("[ssh] VPS_HOST env var is not set");
  if (!privateKeyB64) throw new Error("[ssh] VPS_SSH_PRIVATE_KEY env var is not set");

  const privateKey = Buffer.from(privateKeyB64, "base64");
  return { host, username, privateKey };
}

// ─── runCommand ───────────────────────────────────────────────────────────────

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Opens a fresh SSH connection, runs the command, closes the connection.
 * Throws if the connection fails, the command fails to start, or exits non-zero.
 */
export async function runCommand(cmd: string): Promise<SSHResult> {
  console.log(`[ssh] run: ${cmd}`);

  const { host, username, privateKey } = getSSHConfig();

  return new Promise<SSHResult>((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.destroy();
        reject(new Error(`[ssh] Connection timeout to ${host}`));
      }
    }, 15_000);

    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          settled = true;
          conn.end();
          reject(new Error(`[ssh] exec error: ${err.message}`));
          return;
        }

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number) => {
            clearTimeout(timeout);
            settled = true;
            conn.end();
            console.log(`[ssh] exit ${code}: ${cmd.slice(0, 80)}`);
            if (code !== 0) {
              reject(
                new Error(
                  `[ssh] Command exited with code ${code}\nstdout: ${stdout.trim()}\nstderr: ${stderr.trim()}`
                )
              );
            } else {
              resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
            }
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error(`[ssh] Connection error: ${err.message}`));
      }
    });

    conn.connect({ host, port: 22, username, privateKey, readyTimeout: 10_000 });
  });
}
