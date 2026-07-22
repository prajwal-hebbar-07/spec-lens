import { NextResponse } from "next/server";
import { createPlan, listPlans, plansDir, type PlanContext } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contextFrom(req: Request): PlanContext | null {
  const params = new URL(req.url).searchParams;
  const provider = params.get("provider");
  const account = params.get("account") ?? "";
  const chatId = params.get("chatId");
  if ((provider !== "claude" && provider !== "codex") || !chatId) return null;
  return { provider, account, chatId };
}

export async function GET(req: Request) {
  const context = contextFrom(req);
  if (!context)
    return NextResponse.json(
      { error: "provider and chatId are required" },
      { status: 400 },
    );
  const dir = await plansDir(context);
  if (!dir)
    return NextResponse.json(
      { error: "chat workspace not found" },
      { status: 404 },
    );
  return NextResponse.json(await listPlans(dir).catch(() => []));
}

export async function POST(req: Request) {
  const context = contextFrom(req);
  if (!context)
    return NextResponse.json(
      { error: "provider and chatId are required" },
      { status: 400 },
    );
  let body: { name?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.name !== "string" || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "name and content are required" },
      { status: 400 },
    );
  }
  const dir = await plansDir(context);
  if (!dir)
    return NextResponse.json(
      { error: "chat workspace not found" },
      { status: 404 },
    );
  const result = await createPlan(dir, body.name, body.content);
  if (result === "exists") {
    return NextResponse.json(
      { error: "a plan with that name already exists" },
      { status: 409 },
    );
  }
  if (result === "error") {
    return NextResponse.json(
      { error: "could not import plan" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { name: body.name, content: body.content },
    { status: 201 },
  );
}
