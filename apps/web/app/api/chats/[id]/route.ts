import { NextResponse } from "next/server";
import * as claude from "@/lib/claude";
import * as codex from "@/lib/codex";
import type { Provider } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") as Provider | null;
  const account = searchParams.get("account");
  if (!provider || !account) {
    return NextResponse.json({ error: "provider and account are required" }, { status: 400 });
  }

  const detail =
    provider === "codex"
      ? await codex.getChatDetail(id).catch(() => null)
      : await claude.getChatDetail(account, id).catch(() => null);

  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
