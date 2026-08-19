"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLastJoined,
  clearProfile,
  getLastJoined,
  getProfile,
  setProfile,
  type StoredProfile,
} from "@/lib/identity";
import type { ProfileStats } from "@/lib/api";
import { formatCurrency } from "@/lib/tournament-utils";
import { Avatar } from "@/components/avatar";
import { SelfieCapture } from "@/components/selfie-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NightPlayed {
  code: string;
  name: string;
  date: string;
  players: number;
  finishPosition: number | null;
  winnings: number;
  currency: string;
}

/**
 * You, rather than the table: your photo, your name, your record. It lives here so the
 * tournament screen can stay about the game in front of you — and it is where you leave
 * one night to join another, which is how you get onto a test table and back again.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setStored] = useState<StoredProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [nights, setNights] = useState<NightPlayed[]>([]);
  const [joined, setJoined] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Bumped after a new photo so the cached avatar URL is refetched.
  const [version, setVersion] = useState(0);

  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async (stored: StoredProfile) => {
    // Resolved from the token this device holds, not by matching a name against the
    // leaderboard — that only worked for profiles that happened to be listed.
    const response = await fetch("/api/profiles/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileToken: stored.profileToken }),
    });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    setProfileId(data.profileId);
    setStats(data.stats);
    setNights(data.nights ?? []);
  }, []);

  useEffect(() => {
    const stored = getProfile();
    setStored(stored);
    setJoined(getLastJoined());
    if (stored) {
      setFirst(stored.firstName);
      setLast(stored.lastName);
      void load(stored);
    }
  }, [load]);

  if (!profile) {
    return (
      <div className="min-h-screen px-4 pt-safe pb-safe max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Check in to a tournament first — that is what creates your profile.
        </p>
        <Button className="w-full" onClick={() => router.push("/play")}>
          Join a table
        </Button>
      </div>
    );
  }

  async function saveName() {
    setError(null);
    const response = await fetch("/api/profiles/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profileToken: profile!.profileToken,
        firstName: first.trim(),
        lastName: last.trim(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not change your name");
      return;
    }
    const next = { ...profile!, firstName: first.trim(), lastName: last.trim() };
    setProfile(next);
    setStored(next);
    setEditing(false);
    void load(next);
  }

  async function savePhoto(image: string | null) {
    await fetch("/api/profiles/avatar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileToken: profile!.profileToken, image }),
    });
    setVersion((v) => v + 1);
    setTaking(false);
  }

  return (
    <div className="min-h-screen px-4 pt-safe pb-safe max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>

      {taking ? (
        <Card>
          <CardContent className="pt-4">
            <SelfieCapture
              title="New photo"
              onCapture={savePhoto}
              onSkip={() => setTaking(false)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <Avatar
              key={version}
              profileId={profileId ?? undefined}
              name={`${profile.firstName} ${profile.lastName}`}
              className="h-16 w-16 text-lg"
            />
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-2">
                  <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
                  <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveName} data-testid="save-name">
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="truncate text-lg font-semibold" data-testid="profile-name">
                    {profile.firstName} {profile.lastName}
                  </div>
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Edit name
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTaking(true)}
                      data-testid="change-photo"
                    >
                      {profileId ? "Change photo" : "Add photo"}
                    </Button>
                  </div>
                </>
              )}
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Record</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.nights === 0 ? (
              <p className="text-sm text-muted-foreground">
                No finished nights yet — your record starts after your first one.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Nights" value={String(stats.nights)} />
                <Stat label="Wins" value={String(stats.wins)} />
                <Stat label="KOs" value={String(stats.knockouts)} />
                <Stat
                  label="Best"
                  value={stats.bestFinish !== null ? `#${stats.bestFinish}` : "—"}
                />
                <Stat
                  label="Winnings"
                  value={formatCurrency(stats.winnings, stats.currency ?? "")}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {nights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {nights.map((night) => (
              <div
                key={night.code}
                className="flex items-center gap-3 rounded-md bg-muted/30 p-2"
                data-testid={`history-${night.code}`}
              >
                <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                  {night.finishPosition ? `#${night.finishPosition}` : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{night.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {night.date} &middot; {night.players} players
                  </div>
                </div>
                {night.winnings > 0 && (
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatCurrency(night.winnings, night.currency)}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 py-4">
          <Button
            variant="outline"
            className="w-full"
            data-testid="leave-tournament"
            disabled={!joined}
            onClick={() => {
              clearLastJoined();
              setJoined(null);
              router.push("/play");
            }}
          >
            {joined ? `Leave ${joined} and join another` : "Not at a table"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Leaving only lets go of it on this phone — you keep your seat, and scanning
            that code again puts you straight back.
          </p>
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={() => {
              clearProfile();
              clearLastJoined();
              router.push("/play");
            }}
          >
            Sign out of this profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
