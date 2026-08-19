import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * A profile's photo. Served from its own endpoint rather than inlined into tournament
 * state, which every phone polls every couple of seconds — a dozen thumbnails in that
 * payload would be far more traffic than the pictures are worth.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await query<{ avatar: string | null }>(
    `select avatar from profiles where id = $1`,
    [id],
  );
  if (!row?.avatar) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(row.avatar, "base64"), {
    headers: {
      "content-type": "image/jpeg",
      // Photos change only when someone deliberately retakes one, so let the phone keep
      // it; the URL carries a cache-buster when it does change.
      "cache-control": "public, max-age=86400",
    },
  });
}
