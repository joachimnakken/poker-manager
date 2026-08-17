import { NextResponse } from "next/server";
import { ActionError, applyAction, resolveActor, type Action } from "@/lib/server/actions";
import { loadTournament } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const action = (await request.json()) as Action;
  const token = request.headers.get("x-poker-token") ?? undefined;

  try {
    const actor = await resolveActor(code, token);
    await applyAction(code, actor, action);
  } catch (error) {
    if (error instanceof ActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Every action answers with the whole tournament, so a client never needs a
  // follow-up read to see its own write.
  const tournament = await loadTournament(code);
  return NextResponse.json({ tournament, serverNow: new Date().toISOString() });
}
