import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { loadTournament, resolveTournament } from "@/lib/server/tournaments";
import { seatLateArrival } from "@/lib/server/actions";
import {
  findOrCreateProfile,
  profileByToken,
  profileHasAvatar,
  statsForProfile,
} from "@/lib/server/profiles";
import type { CheckinRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await request.json()) as Partial<CheckinRequest>;
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();

  // A stored token wins; a phone that lost it (or was never here) falls back to the
  // name, which finds-or-creates the same profile. Both paths need the names anyway,
  // so a stale token degrades silently instead of erroring.
  const byToken = body.profileToken ? await profileByToken(body.profileToken) : null;
  if (!byToken && (!firstName || !lastName)) {
    return NextResponse.json({ error: "First and last name required" }, { status: 400 });
  }
  const profile = byToken ?? (await findOrCreateProfile(firstName!, lastName!));

  const tournament = await resolveTournament(code);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.status !== "setup") {
    return NextResponse.json({ error: "Check-in has closed" }, { status: 409 });
  }

  // Re-checking in under the same name returns the same player rather than a duplicate.
  // The conflict update also backfills profile_id onto players the host added by hand.
  const name = `${profile.firstName} ${profile.lastName}`;
  const [player] = await query<{ id: string; player_token: string }>(
    `insert into players (tournament_id, name, profile_id) values ($1, $2, $3)
     on conflict (tournament_id, name) do update set profile_id = excluded.profile_id
     returning id, player_token`,
    [tournament.id, name, profile.id],
  );

  // Arriving after the draw? Take the next free seat, so the response below already
  // reads "Table 2 - Seat 4" instead of "Waiting for the host to draw seats...". This
  // must run before loadTournament, which is evaluated inline in the response. Seating
  // is best-effort: the guest is checked in either way.
  try {
    await seatLateArrival(tournament.id, player.id);
  } catch (error) {
    console.error("late-arrival seating failed", { code, playerId: player.id, error });
  }

  return NextResponse.json({
    playerId: player.id,
    playerToken: player.player_token,
    profileToken: profile.profileToken,
    firstName: profile.firstName,
    lastName: profile.lastName,
    stats: await statsForProfile(profile.id),
    hasAvatar: await profileHasAvatar(profile.id),
    tournament: await loadTournament(code),
    serverNow: new Date().toISOString(),
  });
}
