import { NextResponse } from "next/server";
import { listPlans } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listPlans().catch(() => []));
}
