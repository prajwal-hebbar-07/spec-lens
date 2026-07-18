import { NextResponse } from "next/server";
import * as claude from "@/lib/claude";
import * as codex from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [claudeAccounts, codexAccounts] = await Promise.all([
    claude.listAccounts().catch(() => []),
    codex.listAccounts().catch(() => []),
  ]);
  return NextResponse.json([...claudeAccounts, ...codexAccounts]);
}
