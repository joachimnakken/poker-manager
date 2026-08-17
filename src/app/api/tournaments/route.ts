import { NextResponse } from "next/server";
import { createTournament, listTournaments } from "@/lib/server/tournaments";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournaments = await listTournaments();
  return NextResponse.json({ tournaments, serverNow: new Date().toISOString() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; date?: string };
  const name = body.name?.trim();
  const date = body.date?.trim();

  if (!name || !date) {
    return NextResponse.json({ error: "name and date are required" }, { status: 400 });
  }

  const created = await createTournament(name, date);
  return NextResponse.json(created, { status: 201 });
}
