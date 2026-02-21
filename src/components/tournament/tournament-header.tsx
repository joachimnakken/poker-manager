"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useTournamentStore } from "@/store/tournament-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function TournamentHeader({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const updateConfig = useTournamentStore((s) => s.updateConfig);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!tournament) return null;

  const statusColor = {
    setup: "outline" as const,
    running: "default" as const,
    paused: "secondary" as const,
    break: "default" as const,
    finished: "secondary" as const,
  };

  function startEditing() {
    setEditName(tournament!.config.name);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== tournament!.config.name) {
      updateConfig(tournamentId, { name: trimmed });
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          {editing ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="text-xl md:text-2xl font-bold h-auto py-0 px-1 -ml-1"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl md:text-2xl font-bold truncate">
                {tournament.config.name}
              </h1>
              <button
                onClick={startEditing}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <PencilIcon />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{tournament.config.date}</p>
        </div>
        <Badge variant={statusColor[tournament.status]}>
          {tournament.status === "break" ? "Break" : tournament.status}
        </Badge>
      </div>
      <div className="flex gap-2">
        {tournament.status !== "finished" && (
          <Link href={`/tournament/${tournamentId}/settings`}>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </Link>
        )}
        <Link href="/">
          <Button variant="ghost" size="sm">
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
