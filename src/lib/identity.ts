"use client";

/**
 * Who this device is, per tournament. A home game among friends: the token stops
 * accidents and lets a phone remember itself across a refresh. It is not a security
 * boundary — anyone with the join code can check in as a new player.
 */
export interface Identity {
  ownerToken?: string;
  playerToken?: string;
  playerId?: string;
}

const STORAGE_KEY = "poker-identity";

type IdentityMap = Record<string, Identity>;

function readAll(): IdentityMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as IdentityMap;
  } catch {
    return {};
  }
}

export function getIdentity(code: string): Identity {
  return readAll()[code.toUpperCase()] ?? {};
}

export function setIdentity(code: string, patch: Identity): void {
  if (typeof window === "undefined") {
    return;
  }
  const all = readAll();
  const key = code.toUpperCase();
  all[key] = { ...all[key], ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** The token a write should carry: host rights win over player rights. */
export function tokenFor(code: string): string | undefined {
  const identity = getIdentity(code);
  return identity.ownerToken ?? identity.playerToken;
}

/** The tournament codes this device created — the ones whose host pages it may open. */
export function ownedCodes(): Set<string> {
  return new Set(
    Object.entries(readAll())
      .filter(([, identity]) => identity.ownerToken)
      .map(([code]) => code),
  );
}

/**
 * The device's owner across tournaments — set after any successful check-in, so the
 * next poker night opens with a one-tap "Join as X". The names ride along because the
 * server treats a stale token + names as an ordinary named check-in.
 */
export interface StoredProfile {
  profileToken: string;
  firstName: string;
  lastName: string;
}

const PROFILE_KEY = "poker-profile";

export function getProfile(): StoredProfile | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "null") as
      | StoredProfile
      | null;
    return stored?.profileToken && stored.firstName && stored.lastName ? stored : null;
  } catch {
    return null;
  }
}

export function setProfile(profile: StoredProfile): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
}

export function clearProfile(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PROFILE_KEY);
  }
}

/**
 * The tournament this device last checked into. The installed app opens straight to it,
 * so a player never sees a tournament list — and once that night is over or gone, the
 * app falls back to the scanner rather than a stale game.
 */
const LAST_JOINED_KEY = "poker-last-joined";

export function getLastJoined(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LAST_JOINED_KEY);
}

export function setLastJoined(code: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_JOINED_KEY, code.toUpperCase());
  }
}

export function clearLastJoined(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LAST_JOINED_KEY);
  }
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates the display-mode media query for home-screen apps.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
