# Multi-table + QR-joined mobile view

**Goal:** A tournament can run across several tables, with every player joining from their phone via a QR code on the projector, so knockouts can be recorded at tables the host isn't sitting at and the host can play instead of administrate.

Settled in a grilling session on 2026-08-17. This file is the record — the decisions below were made deliberately, not defaulted into.

---

## Why this is a rewrite, not a feature

All 27 client components read `useTournamentStore` directly, and the store persists to `localStorage`. A phone is a different device with a different `localStorage`, so it sees nothing. Every part of this depends on state leaving the browser first.

**Blast-radius control:** keep the store's *read* API identical. Components keep calling the same selectors (`useTournamentStore(s => s.tournaments[id])`); only the store's internals change from `persist` to server-sync, and actions become async. Most components should not need editing at all. If a step starts rewriting component internals, stop — the store shape is wrong.

---

## Two architectural decisions that everything else rests on

### The clock is derived, never stored ticking

Do **not** persist `secondsRemaining`. Store the anchor instead:

| Column | Meaning |
| --- | --- |
| `current_level_index` | which level |
| `level_started_at` | `timestamptz`, when it began |
| `paused_at` | `timestamptz` nullable, when the current pause began |
| `paused_ms` | accumulated paused time for this level |

Every client computes the countdown locally from those four values. Consequences:

- Writes happen on real events only — roughly 100 a night instead of one per second per client.
- All devices agree without being in constant contact; a phone that loses signal for a minute comes back correct.
- **Phone clocks drift.** `GET /api/t/[code]/state` must return `serverNow`; each client stores `offset = serverNow - Date.now()` at load and applies it. Skipping this is the likeliest source of "my phone says 3:12 and the projector says 3:19".

The existing `tick` action in `tournament-store.ts` and the interval in `use-timer.ts` stop being the source of truth. The interval stays, but only to trigger a re-render — it recomputes from the anchor rather than decrementing a counter.

### Concurrency is normal, so writes must be atomic

Two captains recording knockouts at different tables simultaneously is an expected case, not an edge case.

- **Rebuys / addons** — safe as plain column updates: `UPDATE players SET rebuys = rebuys + 1 WHERE id = $1`. Postgres makes this atomic; no read-modify-write in application code.
- **Knockouts** — order-sensitive, because finish position is "how many players were still active at that instant". Must run in a transaction: count active, update the player, append to the log, commit. `SERIALIZABLE` isolation, with a retry on serialisation failure.

Note this schema is simpler than the append-only event log sketched during grilling. Full event sourcing was dropped because only knockouts are genuinely order-sensitive, and a transaction handles those. If undo-anything or an audit trail is ever wanted, revisit.

---

## Schema

```
tournaments   id, code (short, unique), name, date, status, config jsonb,
              current_level_index, level_started_at, paused_at, paused_ms,
              seats_per_table, owner_token, created_at

players       id, tournament_id, name, rebuys, has_addon, is_active,
              finish_position, knocked_out_in_level, knocked_out_by,
              player_token, checked_in_at

tables        tournament_id, table_number, captain_player_id,
              captain_claimed_at          -- PK (tournament_id, table_number)

seats         tournament_id, player_id, table_number, seat_number

knockouts     id bigserial, tournament_id, player_id, by_player_id,
              level, created_at           -- append-only, ordered

proposals     id, tournament_id, player_id,
              from_table, from_seat, to_table, to_seat,
              proposed_at, from_confirmed_at, to_confirmed_at,
              status, decline_reason
```

`config jsonb` keeps the existing `TournamentConfig` shape (blind structure, buy-ins, payout percentages) so `constants.ts`, `prize-calculator.ts` and the settings page work unchanged.

### Identity and threat model

Check-in issues a `player_token` (uuid) that the phone keeps in its own `localStorage`; writes carry it. The tournament creator gets an `owner_token` the same way.

This is a **home game among friends**. The token prevents accidents and lets a phone remember who it is across a refresh. It is not a security boundary — anyone with the join code can check in as a new player. Do not invest in hardening this; if it ever needs to be real, that is a different project.

---

## Decisions from the grilling

| Area | Decision |
| --- | --- |
| Permissions | Everyone reads. One captain per table gets KO / Rebuy / Addon, scoped to that table's players. Host overrides all. |
| Captaincy | Owner is auto-captain of their own table while active, locked. Other tables: first to claim. Released on bust, reclaimable. Host can seize or assign. |
| Unclaimed tables | Host is fallback captain, so a move always has exactly two confirmers and cannot deadlock. |
| Moves | Both source and destination captains confirm. Host sees the proposal and can Force after 60s. Decline takes a reason and the app proposes the next-best player. |
| Balancing trigger | App proposes when `max - min >= 2`. Proposes breaking a table when its players fit in the free seats elsewhere. Advisory only — humans always confirm. |
| Joining | One tournament code, QR on the projector. Self check-in by typing your name. Host draws seats; all phones update at once. |
| Chip stacks | Not tracked. Derive busts-to-money, payout ladder, rebuy countdown, average stack. |
| Phone lifecycle | Mirrors `TournamentStatus`: setup → checked-in / seat + chip values; running, paused, break → in play; busted → result then spectator; finished → results. |
| Phone layout | Companion vs standalone-clock toggle, remembered per device. |
| Alerts | In-page chime + wake lock for captains. No web push, no PWA install step. |
| Table sizing | `seats_per_table` setting, default 9. Table count = `ceil(players / seats_per_table)`. |
| Projector | Extended display: controls on the laptop, `/display/[code]` in a second window. |
| Legacy data | **Not migrated.** Existing `localStorage` tournaments render read-only under "Past games (this browser)" on the home page, reusing `TournamentResults`. No import flow. |

`CHIP_SET` in `constants.ts` is currently defined and rendered nowhere — the phone's pre-game chip reference is its first real consumer.

---

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Create tournament, list active, legacy local games read-only |
| `/tournament/[id]` | Host control — existing page, adapted for tables |
| `/tournament/[id]/settings` | Existing, plus `seats_per_table` |
| `/display/[code]` | Projector: huge clock, QR + join code, table overview |
| `/t/[code]` | The phone view. Deliberately short — QR density scales with URL length |
| `/api/t/[code]/state` | `GET`, returns whole tournament + `serverNow` |
| `/api/t/[code]/checkin` | `POST` name → player_token |
| `/api/t/[code]/action` | `POST` knockout / rebuy / addon / claim-captaincy |
| `/api/t/[code]/proposal` | `POST` create / confirm / decline / force |

Phones poll `state` every 2s. At 16 phones that is ~8 req/s and a ~10KB body — well inside Fluid Compute defaults. Do not reach for SSE or a realtime vendor until polling is measurably a problem.

---

## Steps

Phased so the app is usable at the end of every phase. It should be possible to run a real poker night after phase 2 even if phases 3–5 never land.

### Phase 1 — Backend and derived clock, single table

1. ~~Provision Neon.~~ **DONE 2026-08-17.** Org `Joachim` / `org-autumn-breeze-35288781`, project **`poker-manager`** = `blue-cake-16637222`. Branches: `main` = `br-curly-cloud-awltlqx4` (production), `dev` = `br-empty-tooth-aw6f8hll` (local). `.env.local` holds the **dev** connection string and is gitignored. Vercel must be pointed at **main** at deploy time.
2. ~~Schema.~~ **DONE 2026-08-17.** `db/schema.sql` applied to `main`; `dev` branched afterwards and inherited all six tables. Verified via `get_database_tables` on both branches. ~~The `db/migrate.ts` runner is still TODO.~~ **DONE** — `npm run db:migrate` applies the idempotent schema to whatever `DATABASE_URL` points at (defaults to `.env.local` = dev).
3. ~~Replace `persist` with server-sync.~~ **DONE 2026-08-17.** Store keyed by tournament **code** (= `config.id`); reads identical, actions async, `use-sync.ts` polls 2s live / 6s idle. Server: `lib/server/{db,tournaments,actions,proposals}.ts`, routes under `/api`. 60-assertion API smoke suite passed against Neon dev.
4. ~~Clock to the anchor model.~~ **DONE 2026-08-17.** `advance-level` rolls the anchor forward by exactly the level duration (guarded on `fromIndex`, so racing clients advance once); verified by e2e "the derived clock agrees across devices".
5. Deploy to Vercel. → **verify:** create a tournament on the deployed URL, hard-refresh, it is still there. **NOT DONE — needs the Vercel project + `DATABASE_URL` (Neon `main`) env var, and a push.**

### Phase 2 — Multi-table — **DONE 2026-08-17**

6. ~~`seats_per_table` + multi-table draw.~~ Round-robin assignment: 12 players at 9/table → 6/6, not 9/3. Smoke-tested.
7. ~~Host UI grouped by table, captain shown.~~ `player-table.tsx` groups when >1 table, host assigns/seizes captains from a popover; cross-table finish positions stay one sequence (e2e-verified).
8. ~~Balancing proposals.~~ Pure `lib/balancing.ts` (10 unit tests): break preferred over move, deterministic under the poll, busted seats count free. `table-balance.tsx` gives the host "Move now" and "Ask captains".

### Phase 3 — Read-only phone and projector — **DONE 2026-08-17**

9. ~~`/display/[code]`.~~ react-qr-code; QR shows during setup, table overview always, non-interactive.
10. ~~`/t/[code]` lifecycle-driven + layout toggle.~~ e2e-verified at 380px through setup → seated → running → busted → finished with zero horizontal overflow; the Clock layout survives a reload.
11. ~~Check-in flow.~~ Same-name re-checkin returns the same player (refresh-safe). Chip reference (`CHIP_SET`'s first consumer) shows pre-game.

### Phase 4 — Captains and writes — **DONE 2026-08-17**

12. ~~Captaincy claim / release on bust / host seize.~~ Claim is first-wins (409 when taken, 403 off-table); bust releases in the same transaction. *Owner auto-captaincy dropped deliberately: the owner runs the host UI, which already overrides everywhere — a lock added a rule with no behaviour behind it.*
13. ~~Scoped captain buttons.~~ e2e: cross-table KO → **403 from the API**, not a hidden button; rebuy window enforced server-side.
14. ~~Bust → result → spectator.~~ e2e: phone flips to `#position` within a poll.

### Phase 5 — The two-captain handshake — **DONE 2026-08-17**

15. ~~Proposal lifecycle.~~ e2e: with three contexts the move applies **only after the second confirm**; proposer's own side counts as confirmed; decline requires a reason; host force gated to 60s.
16. ~~Host fallback for unclaimed tables.~~ e2e: releasing the destination captaincy lets the host's single confirm complete the move.

---

## Success criteria

The one that matters, because it is the thing that cannot be checked by reading code:

**A Playwright spec with four browser contexts** — host, captain at table 1, captain at table 2, and a spectator — where a knockout recorded on captain 1's phone appears on all four within 3 seconds, and finish positions remain a correct single sequence.

**MET 2026-08-17** — `e2e/multi-table.spec.ts`, 6/6 green (`npm run test:e2e`). The 3s window is measured from the commit (the writer's own view updating), because locally every request pays a WAN round trip to Neon us-east-1 that production does not. One systemic find: `pg` pool `max: 3` let four polling devices queue writes behind reads — confirms took 6.5s until the pool went to 10.

Supporting checks: `npx tsc --noEmit` clean; the derived clock agrees across contexts to within a second; a captain's cross-table write is rejected by the API. **All three hold** — plus 25 unit tests (clock + balancing) and a 60-assertion API smoke suite.

Note `npm` is aliased to `pnpm` on this machine — use `/Users/joachim/.nvm/versions/node/v22.17.1/bin/npm` or the binaries in `node_modules/.bin` directly.

---

## Known risks

- **Phone clock skew** is the most likely visible bug. The `serverNow` offset is not optional.
- **Serialisation retries** on simultaneous knockouts need an actual retry loop, not a single attempt.
- **Poll cost while idle.** 16 phones polling all night is a lot of quiet requests. If it matters, back off the interval when `status` is `setup` or `finished`.
- **The host is also a player.** Every host-only affordance has to be reachable from a laptop that its owner is not looking at, because they are playing a hand.
