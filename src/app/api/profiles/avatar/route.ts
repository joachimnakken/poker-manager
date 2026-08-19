import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { profileByToken } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

/** Roughly 200x200 JPEG at base64 expansion, with headroom. */
const MAX_BYTES = 400_000;

/**
 * Sets or clears the photo on the profile this device owns. The profile token is the
 * only credential — the same home-game trust model as everything else here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    profileToken?: string;
    image?: string | null;
  } | null;

  if (!body?.profileToken) {
    return NextResponse.json({ error: "Not your profile" }, { status: 401 });
  }
  const profile = await profileByToken(body.profileToken);
  if (!profile) {
    return NextResponse.json({ error: "Not your profile" }, { status: 401 });
  }

  const image = body.image ?? null;
  if (image !== null && image.length > MAX_BYTES) {
    return NextResponse.json({ error: "That photo is too large" }, { status: 413 });
  }

  await query(`update profiles set avatar = $2 where id = $1`, [profile.id, image]);
  return NextResponse.json({ ok: true, profileId: profile.id });
}
