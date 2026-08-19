"use client";

import Link from "next/link";
import { Gavel, ListOrdered, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/rankings", label: "Rankings", Icon: ListOrdered },
  { href: "/showdown", label: "Showdown", Icon: Gavel },
  { href: "/stats", label: "Stats", Icon: Trophy },
];

/**
 * The player app's three reference screens, as a row of proper targets rather than the
 * small underlined links they used to be. Icon over a short label is the native tab-bar
 * convention, and each tile clears the 44pt minimum comfortably — this gets tapped with
 * a thumb, one-handed, holding cards in the other.
 */
export function PlayerNav({ className }: { className?: string }) {
  return (
    <nav className={cn("grid grid-cols-3 gap-2", className)}>
      {LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          data-testid={`nav-${label.toLowerCase()}`}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card/60 py-3 text-muted-foreground transition-colors active:bg-card"
        >
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          <span className="text-xs font-medium">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
