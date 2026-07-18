import { NextResponse } from "next/server";
import * as claude from "@/lib/claude";
import * as codex from "@/lib/codex";
import type { Provider } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") as Provider | null;
  const account = searchParams.get("account");
  if (!provider || !account) {
    return NextResponse.json({ error: "provider and account are required" }, { status: 400 });
  }

  const chats =
    provider === "codex"
      ? await codex.listChats().catch(() => [])
      : await claude.listChats(account).catch(() => []);
  return NextResponse.json(chats);
}
