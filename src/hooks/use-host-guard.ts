"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdentity } from "@/lib/identity";

/**
 * The host pages belong to the device that created the tournament. Anyone else who
 * wanders in — a player tapping Home mid-game, a shared link — is sent to the phone
 * view, which has a mode for every role. Writes were always rejected server-side;
 * this keeps the wrong dashboard from even rendering. Returns false until the
 * post-mount localStorage read settles, so callers can hold their render.
 */
export function useHostGuard(code: string): boolean {
  const router = useRouter();
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (getIdentity(code).ownerToken) {
      setIsHost(true);
    } else {
      router.replace(`/t/${code}`);
    }
  }, [code, router]);

  return isHost;
}
