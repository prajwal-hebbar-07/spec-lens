import { NextResponse } from "next/server";
import { getUsageForAccount } from "@/lib/claude";
import * as codex from "@/lib/codex";
import type { Provider } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProvider(v: string | null): Provider {
  return v === "codex" ? "codex" : "claude";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account");
  if (!account) {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }
  const provider = parseProvider(searchParams.get("provider"));
  // Both providers report live rolling-limit usage: Codex embeds it in its
  // transcripts; Claude serves it from the OAuth usage API (same source as the
  // CLI statusline and the Cursor usage panel).
  const usage =
    provider === "codex"
      ? await codex.getUsage()
      : await getUsageForAccount(account);
  return NextResponse.json(usage);
}
