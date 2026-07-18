import { NextResponse } from "next/server";
import { reviewPlan } from "@/lib/plans";
import type { Provider } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  let body: { provider?: Provider; account?: string; chatId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if ((body.provider !== "claude" && body.provider !== "codex") || !body.chatId) {
    return NextResponse.json({ error: "provider and chatId are required" }, { status: 400 });
  }
  const result = await reviewPlan({
    name: decodeURIComponent(name),
    provider: body.provider,
    account: body.account ?? "",
    chatId: body.chatId,
  });
  if ("error" in result) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}
