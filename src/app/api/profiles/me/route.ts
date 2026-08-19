import { NextResponse } from "next/server";
import { profileByToken, profileHistory, statsForProfile } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

/**
 * Everything the profile page needs, resolved from the token the device already holds.
 * Looking yourself up by name in the leaderboard worked only for profiles that happened
 * to be listed, and quietly failed otherwise.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { profileToken?: string } | null;
  if (!body?.profileToken) {
    return NextResponse.json({ error: "Not your profile" }, { status: 401 });
  }
  const profile = await profileByToken(body.profileToken);
  if (!profile) {
    return NextResponse.json({ error: "Not your profile" }, { status: 401 });
  }

  return NextResponse.json({
    profileId: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    stats: await statsForProfile(profile.id),
    nights: await profileHistory(profile.id),
  });
}
