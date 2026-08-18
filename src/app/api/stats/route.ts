import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    leaderboard: await leaderboard(),
    serverNow: new Date().toISOString(),
  });
}
