import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * A profile's photo. Served from its own endpoint rather than inlined into tournament
 * state, which every phone polls every couple of seconds — a dozen thumbnails in that
 * payload would be far more traffic than the pictures are worth.
 *
 * Revalidated rather than cached outright. These are a couple of kilobytes, so a
 * conditional request costs nothing, and it means retaking a photo shows up everywhere
 * immediately. Caching it hard for a day meant a new picture never appeared: the URL
 * does not change, so the browser kept answering from its own cache.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await query<{ avatar: string | null }>(
    `select avatar from profiles where id = $1`,
    [id],
  );
  if (!row?.avatar) {
    return new NextResponse(null, { status: 404 });
  }

  // The photo's own content is its version, so no timestamp column is needed.
  const etag = `"${createHash("sha1").update(row.avatar).digest("base64url").slice(0, 22)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { etag, "cache-control": "no-cache" },
    });
  }

  return new NextResponse(Buffer.from(row.avatar, "base64"), {
    headers: {
      "content-type": "image/jpeg",
      etag,
      // Always ask; answer 304 when it has not changed.
      "cache-control": "no-cache",
    },
  });
}
