import { NextResponse } from "next/server";
import { askPlan } from "@/lib/ask";
import type { Provider } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: {
    provider?: Provider;
    account?: string;
    chatId?: string;
    question?: string;
    selection?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.chatId || !body.question) {
    return NextResponse.json({ error: "chatId and question are required" }, { status: 400 });
  }

  const result = await askPlan({
    provider: body.provider === "codex" ? "codex" : "claude",
    account: body.account ?? "",
    chatId: body.chatId,
    question: body.question,
    selection: body.selection,
  });

  if ("error" in result) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}
