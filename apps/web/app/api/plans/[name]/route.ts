import { NextResponse } from "next/server";
import {
  addComment,
  plansDir,
  readPlan,
  writePlan,
  type PlanContext,
} from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dirFrom(req: Request): Promise<string | null> {
  const params = new URL(req.url).searchParams;
  const provider = params.get("provider");
  const chatId = params.get("chatId");
  if ((provider !== "claude" && provider !== "codex") || !chatId) return null;
  const context: PlanContext = {
    provider,
    account: params.get("account") ?? "",
    chatId,
  };
  return plansDir(context);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const dir = await dirFrom(_req);
  if (!dir)
    return NextResponse.json(
      { error: "chat workspace not found" },
      { status: 404 },
    );
  const content = await readPlan(dir, decodeURIComponent(name));
  if (content == null)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ name, content });
}

/** Insert an `@me` review marker into the plan and return the updated content. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const dir = await dirFrom(req);
  if (!dir)
    return NextResponse.json(
      { error: "chat workspace not found" },
      { status: 404 },
    );
  let body: { insertOffset?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (
    typeof body.insertOffset !== "number" ||
    typeof body.comment !== "string"
  ) {
    return NextResponse.json(
      { error: "insertOffset and comment are required" },
      { status: 400 },
    );
  }
  const content = await addComment(
    dir,
    decodeURIComponent(name),
    body.insertOffset,
    body.comment,
  );
  if (content == null)
    return NextResponse.json(
      { error: "could not add comment" },
      { status: 400 },
    );
  return NextResponse.json({ name, content });
}

/** Overwrite the plan with the provided content (used to remove markers). */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const dir = await dirFrom(req);
  if (!dir)
    return NextResponse.json(
      { error: "chat workspace not found" },
      { status: 404 },
    );
  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const ok = await writePlan(dir, decodeURIComponent(name), body.content);
  if (!ok)
    return NextResponse.json({ error: "could not save" }, { status: 400 });
  return NextResponse.json({ name, content: body.content });
}
