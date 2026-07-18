import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface ClaudeCredential {
  service: string;
  organizationUuid: string | null;
  accessToken: string;
  expiresAt: number | null;
}

/**
 * Read Claude Code's OAuth credentials from the macOS login Keychain. Each login
 * is stored under a `Claude Code-credentials[-<hash>]` generic-password item; we
 * discover the service names, then read each secret. The first read of an item
 * may raise a macOS "allow access" prompt — grant "Always Allow" once.
 *
 * macOS only; returns [] elsewhere or on any failure (feature degrades to no
 * usage data rather than erroring).
 */
export async function readClaudeCredentials(): Promise<ClaudeCredential[]> {
  if (process.platform !== "darwin") return [];

  const services = await discoverServices();
  const creds: ClaudeCredential[] = [];
  for (const service of services) {
    const secret = await readSecret(service);
    if (!secret) continue;
    try {
      const parsed = JSON.parse(secret) as {
        claudeAiOauth?: { accessToken?: string; expiresAt?: number };
        organizationUuid?: string;
      };
      const accessToken = parsed.claudeAiOauth?.accessToken;
      if (!accessToken) continue;
      creds.push({
        service,
        organizationUuid: parsed.organizationUuid ?? null,
        accessToken,
        expiresAt: parsed.claudeAiOauth?.expiresAt ?? null,
      });
    } catch {
      // ignore malformed entries
    }
  }
  return creds;
}

/** List generic-password service names that start with "Claude Code-credentials". */
async function discoverServices(): Promise<string[]> {
  try {
    const { stdout } = await exec("/usr/bin/security", ["dump-keychain"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const names = new Set<string>();
    for (const m of stdout.matchAll(/"svce"<blob>="(Claude Code-credentials[^"]*)"/g)) {
      if (m[1]) names.add(m[1]);
    }
    return [...names];
  } catch {
    // Fall back to the canonical name if dump is unavailable.
    return ["Claude Code-credentials"];
  }
}

async function readSecret(service: string): Promise<string | null> {
  try {
    const { stdout } = await exec("/usr/bin/security", [
      "find-generic-password",
      "-s",
      service,
      "-w",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
