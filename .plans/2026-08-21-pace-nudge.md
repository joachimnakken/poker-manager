# Pace nudge — "should we speed this up?"

The night runs to 3am because nobody notices it is going to until it has. Blinds go up on
schedule, everyone still has chips, and the decision to speed up never gets made because
nobody owns it. This puts a number on it and hands the host two buttons.

Trigger, from the grilling: **projected finish time** past a target the host set, re-checked
at every level change **after the first break**. Not "almost nobody is out" as an absolute
count — that means something different for 8 players than for 16, and the thing everyone
actually cares about is what time they get to bed.

## The projection is an elimination-rate extrapolation, not a chip model

```
bustsSoFar     = players.length - activeCount
bustsRemaining = activeCount - 1          // last one standing ends it
rate           = max(bustsSoFar, 1) / elapsedSinceStart
projectedEnd   = now + bustsRemaining / rate
```

Two properties matter more than accuracy:

- **It is arguable at the table.** "Two out in ninety minutes, nine left, so eight more busts
  at forty-five minutes each — that's six more hours." A host can check that in their head and
  push back on it. A chip-distribution model cannot be checked in your head, so it gets
  ignored or trusted blindly, and neither is useful at 1am.
- **It is deliberately pessimistic.** Eliminations accelerate as blinds rise, so real finishes
  land earlier than linear. Nudging at midnight and being forty minutes gloomy beats modelling
  ICM and nudging at 2am.

`max(bustsSoFar, 1)` is the whole trick. With zero eliminations the true rate is 0 and the
projection is `Infinity` — the one night the feature most needs to fire is the night the naive
formula divides by zero. Flooring the numerator at one bust projects "as if the first bust
happens right now", which is finite, still pessimistic, and keeps `suggestPace` total: no
`Infinity`, no `null`-for-unknowable, no special case in the UI.

## Why shortening rounds does not get a predicted finish time

The projection knows nothing about level durations, so it **cannot** honestly say "cut rounds
to 13 minutes and you'll finish by 01:00". That number would be fabricated.

So the round-time remedy reports the one thing that *is* exactly knowable: the scheduled play
time it removes. "Cut the remaining rounds 20 → 13 min, saving 1h10m of scheduled play" is
arithmetic over `blindStructure`, checkable and true. The blind-skip remedy makes no numeric
claim at all.

## Two things the data model did not have

1. **No tournament start timestamp.** `ClockAnchor.levelStartedAt` is per-level and rewritten
   on every level change; `tournaments.created_at` is when the row was *created*, which can be
   an hour before anyone sat down. Adds `tournaments.started_at`, set on `start`, cleared on
   `reset`, mapped onto `Tournament.startedAt`. Follows the existing
   `alter table ... add column if not exists` idiom (already used five times in schema.sql).

2. **No target finish time.** Lives in `TournamentConfig.targetFinishAt` as an ISO instant.
   `config` is a jsonb blob, so an optional field needs no migration. The settings page takes
   a `HH:MM` from an `<input type="time">`; `resolveTargetFinish` turns it into the *next*
   occurrence of that clock time, so 01:00 entered at 22:00 means tomorrow, not fourteen hours
   ago.

Elimination *timestamps* are deliberately not needed — the projection uses a count and one
start time, both already available. `knockouts.created_at` only reaches the client through the
30-second announcement window, and widening that would have been a much larger change.

## The remedies reuse existing actions

| Remedy | Mechanism |
|---|---|
| Skip to the next level now | existing `next-level` action, unchanged |
| Cut the remaining rounds | existing `update-config` with a rewritten `blindStructure` |

**The current level's duration is never touched.** Editing it is the one edit that breaks the
running clock: `readClock` computes `level.duration - elapsed` against an unchanged
`levelStartedAt`, so shortening the live level below its elapsed time drives `remaining <= 0`,
which makes `levelsOverrun > 0` and fires an immediate `advance-level` from `tick`. Only
unplayed non-break levels are rewritten, floored at 5 minutes.

## No dismiss button

`TableBalance` — the existing advisory — has no dismissal and no dismissal persistence, and
grep confirms no snooze/acknowledge mechanism exists anywhere in the schema or store. The card
follows it: it renders while the projection is past target and disappears when it is not, which
is also the honest behaviour (act, or watch it keep saying the same thing).

## Steps

### 1. `started_at` end to end
`db/schema.sql` column; `TournamentRow`; `TOURNAMENT_COLUMNS`; the `start` and `reset` SQL;
`Tournament.startedAt`. Verify: `npm run db:migrate` twice, then a start→reset→start cycle.

### 2. `TournamentConfig.targetFinishAt` + `resolveTargetFinish`
Verify: unit test for the midnight rollover, both sides of it.

### 3. `src/lib/pacing.ts` — pure `suggestPace`
Verify: `src/lib/pacing.test.ts`, node:test with a frozen `T0`, matching `clock.test.ts`.

### 4. `src/components/tournament/pace-nudge.tsx`
Self-gating card mirroring `table-balance.tsx`, rendered after it on the host page.
Verify: typecheck, then drive a real tournament past a break with no busts.

### 5. Settings — "Finish by"
Verify: set it, reload, confirm it survives the 2s poll.

## Success criteria

- With no `targetFinishAt` set, nothing renders and nothing changes. Feature is dormant.
- Before the first break has been *passed*, nothing renders however bad the projection.
- Zero eliminations produces a finite projected time, not `Infinity` or a blank.
- Accepting "skip a level" advances exactly one level and leaves the structure alone.
- Accepting "cut rounds" leaves played levels, the current level and every break byte-identical.
- The card disappears on its own once enough people bust.

## Known risks

- **Rebuys are not modelled.** A player who busts and rebuys still counts as a bust in the rate
  until they are marked active again, so the projection is optimistic during the rebuy period.
  Accepted: `lastRebuyLevel` is early and the nudge only fires after the first break.
- **A long pizza pause inflates elapsed** and so pessimises the rate. Also accepted — wall-clock
  is the honest input for "what time do we get to bed", which is the actual question.
