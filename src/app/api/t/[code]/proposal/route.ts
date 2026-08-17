import { NextResponse } from "next/server";
import { ActionError, resolveActor } from "@/lib/server/actions";
import { applyProposalOp, type ProposalOp } from "@/lib/server/proposals";
import { loadTournament, resolveTournament } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const operation = (await request.json()) as ProposalOp;
  const token = request.headers.get("x-poker-token") ?? undefined;

  const tournament = await resolveTournament(code);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  try {
    const actor = await resolveActor(code, token);
    await applyProposalOp(tournament.id, actor, operation);
  } catch (error) {
    if (error instanceof ActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return NextResponse.json({
    tournament: await loadTournament(code),
    serverNow: new Date().toISOString(),
  });
}
