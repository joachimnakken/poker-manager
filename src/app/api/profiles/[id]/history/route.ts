import { NextResponse } from "next/server";
import { profileHistory, statsForProfile } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    stats: await statsForProfile(id),
    nights: await profileHistory(id),
  });
}
