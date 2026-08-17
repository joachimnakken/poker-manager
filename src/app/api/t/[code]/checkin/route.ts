import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { loadTournament, resolveTournament } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const tournament = await resolveTournament(code);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.status !== "setup") {
    return NextResponse.json({ error: "Check-in has closed" }, { status: 409 });
  }

  // A phone that refreshes and re-checks-in under the same name gets its own player
  // back rather than a duplicate — the name is the identity at a home game.
  const [player] = await query<{ id: string; player_token: string }>(
    `insert into players (tournament_id, name) values ($1, $2)
     on conflict (tournament_id, name) do update set name = excluded.name
     returning id, player_token`,
    [tournament.id, name],
  );

  return NextResponse.json({
    playerId: player.id,
    playerToken: player.player_token,
    tournament: await loadTournament(code),
    serverNow: new Date().toISOString(),
  });
}
