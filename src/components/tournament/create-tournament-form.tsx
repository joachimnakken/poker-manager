"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTournamentStore } from "@/store/tournament-store";

function getDefaultName() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " Cheffeloker Night";
}

export function CreateTournamentForm() {
  const router = useRouter();
  const createTournament = useTournamentStore((s) => s.createTournament);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const placeholder = getDefaultName();

  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) {
      return;
    }
    setCreating(true);
    try {
      const code = await createTournament(name.trim() || placeholder, date);
      router.push(`/tournament/${code}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Tournament</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tournament Name</Label>
            <Input
              id="name"
              placeholder={placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? "Creating…" : "Create Tournament"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
