import { NextResponse } from "next/server";
import { loadTournament } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const tournament = await loadTournament(code);

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return NextResponse.json({ tournament, serverNow: new Date().toISOString() });
}
