import { NextResponse } from "next/server";
import { deleteTournament, resolveTournament } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = request.headers.get("x-poker-token") ?? undefined;
  const tournament = await resolveTournament(code);

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.ownerToken !== token) {
    return NextResponse.json({ error: "Host only" }, { status: 403 });
  }

  await deleteTournament(code);
  return NextResponse.json({ ok: true });
}
