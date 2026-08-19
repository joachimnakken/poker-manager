import { NextResponse } from "next/server";
import { profileByToken, renameProfile } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    profileToken?: string;
    firstName?: string;
    lastName?: string;
  } | null;

  const firstName = body?.firstName?.trim();
  const lastName = body?.lastName?.trim();
  if (!body?.profileToken || !firstName || !lastName) {
    return NextResponse.json({ error: "First and last name required" }, { status: 400 });
  }

  const profile = await profileByToken(body.profileToken);
  if (!profile) {
    return NextResponse.json({ error: "Not your profile" }, { status: 401 });
  }

  const result = await renameProfile(profile.id, firstName, lastName);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, firstName, lastName });
}
