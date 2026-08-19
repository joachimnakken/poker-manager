import { query, serializable, type PoolClient } from "./db";
import { findOrCreateProfile } from "./profiles";
import type { TournamentConfig, TournamentStatus } from "../types";
import type { Action } from "../actions";

export type { Action };

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Actor {
  isOwner: boolean;
  playerId?: string;
  /** The table this actor is seated at, if any. */
  tableNumber?: number;
  /** True when this actor is the recorded captain of `tableNumber`. */
  isCaptain: boolean;
}

interface Context {
  id: string;
  code: string;
  status: TournamentStatus;
  config: TournamentConfig;
  currentLevelIndex: number;
  seatsPerTable: number;
}

async function loadContext(code: string): Promise<Context> {
  const [row] = await query<{
    id: string;
    code: string;
    status: TournamentStatus;
    config: TournamentConfig;
    current_level_index: number;
    seats_per_table: number;
  }>(
    `select id, code, status, config, current_level_index, seats_per_table
     from tournaments where code = $1`,
    [code.toUpperCase()],
  );
  if (!row) {
    throw new ActionError("Tournament not found", 404);
  }
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    config: row.config,
    currentLevelIndex: row.current_level_index,
    seatsPerTable: row.seats_per_table,
  };
}

export async function resolveActor(code: string, token: string | undefined): Promise<Actor> {
  if (!token) {
    return { isOwner: false, isCaptain: false };
  }

  const [owner] = await query<{ id: string }>(
    `select id from tournaments where code = $1 and owner_token = $2`,
    [code.toUpperCase(), token],
  );
  if (owner) {
    return { isOwner: true, isCaptain: false };
  }

  const [player] = await query<{
    id: string;
    table_number: number | null;
    captain_of: number | null;
    is_host: boolean;
  }>(
    `select p.id,
            s.table_number,
            t.table_number as captain_of,
            (tn.host_player_id = p.id) as is_host
     from players p
     join tournaments tn on tn.id = p.tournament_id
     left join seats s on s.player_id = p.id
     left join tables t on t.tournament_id = p.tournament_id and t.captain_player_id = p.id
     where tn.code = $1 and p.player_token = $2`,
    [code.toUpperCase(), token],
  );
  if (!player) {
    return { isOwner: false, isCaptain: false };
  }
  // The host plays too. Once the owner device has marked which player is them, that
  // player's phone is a full host console — they run the night from their seat.
  return {
    isOwner: player.is_host === true,
    playerId: player.id,
    tableNumber: player.table_number ?? undefined,
    isCaptain: player.captain_of !== null,
  };
}

/** The blind level number in play, ignoring breaks. Used for the rebuy window. */
function playLevel(config: TournamentConfig, index: number): number {
  let level = 0;
  for (let i = 0; i <= index && i < config.blindStructure.length; i++) {
    if (!config.blindStructure[i].isBreak) {
      level = config.blindStructure[i].level;
    }
  }
  return level;
}

function statusForLevel(config: TournamentConfig, index: number, running: boolean): TournamentStatus {
  if (!running) {
    return "paused";
  }
  return config.blindStructure[index]?.isBreak ? "break" : "running";
}

/**
 * Finish position is "how many players were still active at that instant". Recomputed
 * from the knockout log after every change so a rebuy or an undo renumbers correctly:
 * the newest knockout sits just above the active count, each earlier one a place below.
 */
async function recomputeFinishPositions(client: PoolClient, tournamentId: string): Promise<void> {
  await client.query(
    `update players set finish_position = null, knocked_out_in_level = null, knocked_out_by = null
     where tournament_id = $1 and is_active`,
    [tournamentId],
  );
  await client.query(
    `with log as (
       select player_id,
              row_number() over (order by id) as rn,
              count(*) over () as total
       from knockouts where tournament_id = $1
     ),
     active as (
       select count(*)::int as n from players where tournament_id = $1 and is_active
     )
     update players p
     set finish_position = log.total - (log.rn - 1) + active.n
     from log, active
     where p.id = log.player_id and p.tournament_id = $1`,
    [tournamentId],
  );
}

/** When one player is left standing the tournament is over; they take first. */
async function finishIfDecided(client: PoolClient, tournamentId: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `select id from players where tournament_id = $1 and is_active`,
    [tournamentId],
  );
  if (rows.length !== 1) {
    return;
  }
  await client.query(
    `update players set is_active = false, finish_position = 1 where id = $1`,
    [rows[0].id],
  );
  await client.query(
    `update tournaments set status = 'finished', paused_at = coalesce(paused_at, now())
     where id = $1`,
    [tournamentId],
  );
}

function requireOwner(actor: Actor): void {
  if (!actor.isOwner) {
    throw new ActionError("Host only", 403);
  }
}

/**
 * Captains may only act on players seated at their own table. The host overrides.
 * Enforced here rather than by hiding a button, so a forged request is rejected too.
 */
async function requireAuthorityOver(
  actor: Actor,
  context: Context,
  playerId: string,
): Promise<void> {
  if (actor.isOwner) {
    return;
  }
  if (!actor.isCaptain || actor.tableNumber === undefined) {
    throw new ActionError("Captain only", 403);
  }
  const [seat] = await query<{ table_number: number }>(
    `select table_number from seats where tournament_id = $1 and player_id = $2`,
    [context.id, playerId],
  );
  if (!seat || seat.table_number !== actor.tableNumber) {
    throw new ActionError("That player is not at your table", 403);
  }
}

/**
 * The host runs their own table, so they hold its captaincy. Called both when the host
 * marks themselves and after every draw — a draw rebuilds the tables outright, so the
 * captaincy has to be re-taken or marking yourself during setup silently loses it.
 */
async function seatHostAsCaptain(client: PoolClient, tournamentId: string): Promise<void> {
  await client.query(
    `update tables t
     set captain_player_id = tn.host_player_id, captain_claimed_at = now()
     from tournaments tn
     join seats s on s.tournament_id = tn.id and s.player_id = tn.host_player_id
     where tn.id = $1 and t.tournament_id = $1 and t.table_number = s.table_number`,
    [tournamentId],
  );
}

async function setSeats(
  tournamentId: string,
  seatsPerTable: number,
  playerIds: string[],
): Promise<void> {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const tableCount = Math.max(1, Math.ceil(shuffled.length / seatsPerTable));
  // Round-robin rather than filling each table in turn, so 16 players over two
  // 9-seat tables lands 8/8 instead of 9/7.
  const perTable: string[][] = Array.from({ length: tableCount }, () => []);
  shuffled.forEach((playerId, index) => {
    perTable[index % tableCount].push(playerId);
  });

  const values: string[] = [];
  const params: unknown[] = [tournamentId];
  perTable.forEach((table, tableIndex) => {
    table.forEach((playerId, seatIndex) => {
      params.push(playerId, tableIndex + 1, seatIndex + 1);
      values.push(`($1, $${params.length - 2}, $${params.length - 1}, $${params.length})`);
    });
  });

  // One transaction holding the same tournament-row lock `seatLateArrival` takes.
  // Without it a guest checking in mid-draw lands in the gap between the delete and
  // the insert, and the host's draw dies on the unique (table, seat) index. The
  // shuffle stays outside the callback so a serialization retry replays this draw
  // rather than dealing a different one.
  await serializable(async (client) => {
    await client.query(`select 1 from tournaments where id = $1 for update`, [tournamentId]);
    await client.query(`delete from seats where tournament_id = $1`, [tournamentId]);
    await client.query(`delete from tables where tournament_id = $1`, [tournamentId]);

    if (values.length > 0) {
      await client.query(
        `insert into seats (tournament_id, player_id, table_number, seat_number) values ${values.join(", ")}`,
        params,
      );
      await client.query(
        `insert into tables (tournament_id, table_number)
         select $1, generate_series(1, $2)`,
        [tournamentId, tableCount],
      );
    }

    await seatHostAsCaptain(client, tournamentId);
  });
}

/**
 * Reseats one player. Exported because the two-captain proposal handshake applies its
 * confirmed move through the same path the host's direct move uses.
 */
export async function movePlayer(
  tournamentId: string,
  playerId: string,
  toTable: number,
  toSeat: number,
): Promise<void> {
  await serializable(async (client) => {
    // Same lock as the draw and the late-arrival seater — a host's move racing a
    // check-in would otherwise collide on the unique (table, seat) index.
    await client.query(`select 1 from tournaments where id = $1 for update`, [tournamentId]);
    const { rows: current } = await client.query<{ table_number: number }>(
      `select table_number from seats where tournament_id = $1 and player_id = $2 for update`,
      [tournamentId, playerId],
    );
    if (current.length === 0) {
      throw new ActionError("That player has no seat to move from", 404);
    }

    // A busted player's seat counts as free, so only an active occupant blocks the move.
    const { rows: blocking } = await client.query<{ player_id: string }>(
      `select s.player_id from seats s
       join players p on p.id = s.player_id
       where s.tournament_id = $1 and s.table_number = $2 and s.seat_number = $3
         and p.is_active and s.player_id <> $4`,
      [tournamentId, toTable, toSeat, playerId],
    );
    if (blocking.length > 0) {
      throw new ActionError("That seat is taken", 409);
    }

    // Any busted player still recorded in the destination seat is cleared first, or the
    // unique (table, seat) index would reject the move.
    await client.query(
      `delete from seats
       where tournament_id = $1 and table_number = $2 and seat_number = $3 and player_id <> $4`,
      [tournamentId, toTable, toSeat, playerId],
    );
    await client.query(
      `update seats set table_number = $3, seat_number = $4
       where tournament_id = $1 and player_id = $2`,
      [tournamentId, playerId, toTable, toSeat],
    );
    await client.query(
      `insert into tables (tournament_id, table_number) values ($1, $2) on conflict do nothing`,
      [tournamentId, toTable],
    );

    // A table that just emptied has no one left to captain it.
    await client.query(
      `update tables set captain_player_id = null, captain_claimed_at = null
       where tournament_id = $1 and table_number = $2
         and not exists (
           select 1 from seats s join players p on p.id = s.player_id
           where s.tournament_id = $1 and s.table_number = $2 and p.is_active
         )`,
      [tournamentId, current[0].table_number],
    );
  });
}

/**
 * Seats one player into the next free seat, or does nothing when the tournament has no
 * draw yet — then the host draws for the whole field later, as normal.
 *
 * For arrivals that land after the draw. It never issues an `update seats`, so it cannot
 * move anyone who has already physically sat down; the only change is adding one chair.
 * Calling it twice for the same player is a no-op.
 */
export async function seatLateArrival(tournamentId: string, playerId: string): Promise<void> {
  await serializable(async (client) => {
    // One seat-picker at a time per tournament. Picking is read-then-insert, so two
    // guests scanning the QR together would both read the same seat as free; the unique
    // (table, seat) index would then reject the loser with 23505, which `serializable`
    // does not retry. The lock is what makes that unreachable, and it returns a value
    // the pick needs anyway.
    const { rows: tournamentRows } = await client.query<{ seats_per_table: number }>(
      `select seats_per_table from tournaments where id = $1 for update`,
      [tournamentId],
    );
    if (tournamentRows.length === 0) {
      return;
    }
    const seatsPerTable = tournamentRows[0].seats_per_table;

    const { rows: guard } = await client.query<{
      is_active: boolean;
      already_seated: boolean;
      has_draw: boolean;
    }>(
      `select p.is_active,
              exists (select 1 from seats where tournament_id = $1 and player_id = $2)
                as already_seated,
              exists (select 1 from tables where tournament_id = $1)
                or exists (select 1 from seats where tournament_id = $1) as has_draw
       from players p
       where p.tournament_id = $1 and p.id = $2`,
      [tournamentId, playerId],
    );
    if (
      guard.length === 0 ||
      !guard[0].has_draw ||
      guard[0].already_seated ||
      !guard[0].is_active
    ) {
      return;
    }

    // A seat counts as free when no *active* player holds it, matching movePlayer and
    // the balance advisor. Emptiest table first keeps arrivals alternating the way the
    // draw's round-robin does; a table emptied during play sorts last, so a latecomer
    // joins live players instead of sitting alone.
    const { rows: target } = await client.query<{ table_number: number; seat_number: number }>(
      `with table_numbers as (
         select table_number from tables where tournament_id = $1
         union
         select table_number from seats where tournament_id = $1
       ),
       occupancy as (
         select t.table_number,
                count(*) filter (where p.is_active) as active_count
         from table_numbers t
         left join seats s on s.tournament_id = $1 and s.table_number = t.table_number
         left join players p on p.id = s.player_id
         group by t.table_number
       )
       select o.table_number, g.seat_number
       from occupancy o
       cross join generate_series(1, $2::int) as g(seat_number)
       where o.active_count < $2::int
         and not exists (
           select 1 from seats s
           join players p on p.id = s.player_id
           where s.tournament_id = $1
             and s.table_number = o.table_number
             and s.seat_number = g.seat_number
             and p.is_active
         )
       order by (o.active_count = 0), o.active_count, o.table_number, g.seat_number
       limit 1`,
      [tournamentId, seatsPerTable],
    );

    let tableNumber: number;
    let seatNumber: number;
    if (target.length > 0) {
      tableNumber = target[0].table_number;
      seatNumber = target[0].seat_number;
    } else {
      // Every table is full, so the night grows one more — one at a time, since the
      // next arrival then sees it with room and joins it.
      const { rows: next } = await client.query<{ table_number: number }>(
        `select coalesce(max(table_number), 0) + 1 as table_number
         from (
           select table_number from tables where tournament_id = $1
           union all
           select table_number from seats where tournament_id = $1
         ) as used`,
        [tournamentId],
      );
      tableNumber = next[0].table_number;
      seatNumber = 1;
    }

    // Any busted player still recorded in that seat is cleared first, exactly as
    // movePlayer does, or the unique (table, seat) index would reject the insert.
    await client.query(
      `delete from seats
       where tournament_id = $1 and table_number = $2 and seat_number = $3 and player_id <> $4`,
      [tournamentId, tableNumber, seatNumber, playerId],
    );
    await client.query(
      `insert into seats (tournament_id, player_id, table_number, seat_number)
       values ($1, $2, $3, $4)
       on conflict (tournament_id, player_id) do nothing`,
      [tournamentId, playerId, tableNumber, seatNumber],
    );
    await client.query(
      `insert into tables (tournament_id, table_number) values ($1, $2) on conflict do nothing`,
      [tournamentId, tableNumber],
    );
  });
}

export async function applyAction(code: string, actor: Actor, action: Action): Promise<void> {
  const context = await loadContext(code);
  const { id, config } = context;

  switch (action.type) {
    case "start": {
      requireOwner(actor);
      const [{ count }] = await query<{ count: string }>(
        `select count(*) from players where tournament_id = $1`,
        [id],
      );
      if (Number(count) < 2) {
        throw new ActionError("Need at least two players", 400);
      }
      await query(
        `update tournaments
         set status = $2, current_level_index = 0, level_started_at = now(),
             paused_at = null, paused_ms = 0
         where id = $1`,
        [id, statusForLevel(config, 0, true)],
      );
      return;
    }

    case "pause": {
      requireOwner(actor);
      await query(
        `update tournaments set status = 'paused', paused_at = now()
         where id = $1 and paused_at is null`,
        [id],
      );
      return;
    }

    case "resume": {
      requireOwner(actor);
      // Fold the pause we are ending into the accumulated total, then clear the anchor.
      await query(
        `update tournaments
         set paused_ms = paused_ms + (extract(epoch from (now() - paused_at)) * 1000)::bigint,
             paused_at = null,
             status = $2
         where id = $1 and paused_at is not null`,
        [id, statusForLevel(config, context.currentLevelIndex, true)],
      );
      // A tournament still in setup has no pause anchor; starting it is the right move.
      await query(
        `update tournaments set status = $2 where id = $1 and level_started_at is not null and paused_at is null`,
        [id, statusForLevel(config, context.currentLevelIndex, true)],
      );
      return;
    }

    case "finish": {
      requireOwner(actor);
      await serializable(async (client) => {
        await client.query(
          `update players set is_active = false, finish_position = 1
           where tournament_id = $1 and is_active and finish_position is null`,
          [id],
        );
        await client.query(
          `update tournaments set status = 'finished', paused_at = coalesce(paused_at, now())
           where id = $1`,
          [id],
        );
      });
      return;
    }

    case "reset": {
      requireOwner(actor);
      await serializable(async (client) => {
        await client.query(`delete from knockouts where tournament_id = $1`, [id]);
        await client.query(`delete from proposals where tournament_id = $1`, [id]);
        await client.query(
          `update players set is_active = true, rebuys = 0, has_addon = false,
                  finish_position = null, knocked_out_in_level = null, knocked_out_by = null
           where tournament_id = $1`,
          [id],
        );
        await client.query(
          `update tournaments
           set status = 'setup', current_level_index = 0, level_started_at = null,
               paused_at = null, paused_ms = 0
           where id = $1`,
          [id],
        );
      });
      return;
    }

    case "next-level":
    case "prev-level": {
      requireOwner(actor);
      const target =
        action.type === "next-level" ? context.currentLevelIndex + 1 : context.currentLevelIndex - 1;
      if (target < 0 || target >= config.blindStructure.length) {
        return;
      }
      // A manual jump restarts the level here and now, so the anchor resets outright.
      await query(
        `update tournaments
         set current_level_index = $2,
             level_started_at = now(),
             paused_ms = 0,
             status = case when paused_at is null then $3::text else 'paused' end
         where id = $1`,
        [id, target, statusForLevel(config, target, true)],
      );
      return;
    }

    case "reset-level": {
      requireOwner(actor);
      await query(
        `update tournaments set level_started_at = now(), paused_ms = 0 where id = $1`,
        [id],
      );
      return;
    }

    case "advance-level": {
      const next = action.fromIndex + 1;
      if (next >= config.blindStructure.length) {
        // Out of levels: freeze the clock rather than run past the structure.
        await query(`update tournaments set paused_at = coalesce(paused_at, now()) where id = $1`, [id]);
        return;
      }
      const spent = config.blindStructure[action.fromIndex].duration;
      // Roll the anchor forward by exactly one level's worth rather than to now(),
      // so a late poll cannot stretch the schedule. Guarded on fromIndex so several
      // clients racing to advance the same level only move it once.
      await query(
        `update tournaments
         set current_level_index = $2,
             level_started_at = level_started_at
                                + (paused_ms || ' milliseconds')::interval
                                + ($3 || ' seconds')::interval,
             paused_ms = 0,
             status = case when paused_at is null then $4::text else status end
         where id = $1 and current_level_index = $5 and level_started_at is not null`,
        [id, next, spent, statusForLevel(config, next, true), action.fromIndex],
      );
      return;
    }

    case "add-player": {
      requireOwner(actor);
      const firstName = action.firstName.trim();
      const lastName = action.lastName.trim();
      if (!firstName || !lastName) {
        throw new ActionError("First and last name required", 400);
      }
      // Host-added players get a profile too — their night must count in career stats
      // even if they never open their phone.
      const profile = await findOrCreateProfile(firstName, lastName);
      // `do update` (not `do nothing`) is what makes `returning` yield a row on the
      // re-add path too.
      const [added] = await query<{ id: string }>(
        `insert into players (tournament_id, name, profile_id) values ($1, $2, $3)
         on conflict (tournament_id, name) do update set profile_id = excluded.profile_id
         returning id`,
        [id, `${profile.firstName} ${profile.lastName}`, profile.id],
      );
      // Added after the draw? Take the next free seat; everyone already seated stays
      // put. Best-effort: the player is registered either way, so a seating failure
      // must not read as "the player wasn't added".
      try {
        await seatLateArrival(id, added.id);
      } catch (error) {
        console.error("late-arrival seating failed", { code, playerId: added.id, error });
      }
      return;
    }

    case "remove-player": {
      requireOwner(actor);
      if (context.status !== "setup") {
        throw new ActionError("Players can only be removed before the tournament starts", 400);
      }
      await query(`delete from players where tournament_id = $1 and id = $2`, [id, action.playerId]);
      return;
    }

    case "knockout": {
      await requireAuthorityOver(actor, context, action.playerId);
      await serializable(async (client) => {
        const { rows } = await client.query<{ is_active: boolean }>(
          `select is_active from players where tournament_id = $1 and id = $2 for update`,
          [id, action.playerId],
        );
        if (rows.length === 0) {
          throw new ActionError("Player not found", 404);
        }
        if (!rows[0].is_active) {
          throw new ActionError("Player is already out", 409);
        }
        await client.query(
          `insert into knockouts (tournament_id, player_id, by_player_id, level)
           values ($1, $2, $3, $4)`,
          [id, action.playerId, action.byPlayerId ?? null, context.currentLevelIndex + 1],
        );
        await client.query(
          `update players
           set is_active = false, knocked_out_in_level = $3, knocked_out_by = $4
           where id = $2 and tournament_id = $1`,
          [id, action.playerId, context.currentLevelIndex + 1, action.byPlayerId ?? null],
        );
        // Captaincy is released on bust so the table can be reclaimed by someone
        // still holding cards.
        await client.query(
          `update tables set captain_player_id = null, captain_claimed_at = null
           where tournament_id = $1 and captain_player_id = $2`,
          [id, action.playerId],
        );
        await recomputeFinishPositions(client, id);
        await finishIfDecided(client, id);
      });
      return;
    }

    case "undo-knockout": {
      requireOwner(actor);
      if (context.status === "finished") {
        throw new ActionError("Reopen the tournament before undoing", 400);
      }
      await serializable(async (client) => {
        const { rows } = await client.query<{ id: string; player_id: string }>(
          `delete from knockouts where id = (
             select id from knockouts where tournament_id = $1 order by id desc limit 1
           ) returning id, player_id`,
          [id],
        );
        if (rows.length === 0) {
          return;
        }
        await client.query(`update players set is_active = true where id = $1`, [rows[0].player_id]);
        await recomputeFinishPositions(client, id);
      });
      return;
    }

    case "rebuy": {
      await requireAuthorityOver(actor, context, action.playerId);
      if (playLevel(config, context.currentLevelIndex) > config.lastRebuyLevel) {
        throw new ActionError("The rebuy window has closed", 400);
      }
      await serializable(async (client) => {
        const { rows } = await client.query<{ is_active: boolean }>(
          `update players set rebuys = rebuys + 1 where tournament_id = $1 and id = $2
           returning is_active`,
          [id, action.playerId],
        );
        if (rows.length === 0) {
          throw new ActionError("Player not found", 404);
        }
        if (rows[0].is_active) {
          return;
        }
        // A busted player buying back in re-enters the field, so their knockout leaves
        // the log and everyone below them moves up a place.
        await client.query(
          `delete from knockouts where tournament_id = $1 and player_id = $2`,
          [id, action.playerId],
        );
        await client.query(`update players set is_active = true where id = $1`, [action.playerId]);
        await recomputeFinishPositions(client, id);
      });
      return;
    }

    case "addon": {
      await requireAuthorityOver(actor, context, action.playerId);
      await query(
        `update players set has_addon = true where tournament_id = $1 and id = $2 and not has_addon`,
        [id, action.playerId],
      );
      return;
    }

    case "draw-seats": {
      requireOwner(actor);
      const players = await query<{ id: string }>(
        `select id from players where tournament_id = $1 order by checked_in_at, id`,
        [id],
      );
      if (players.length === 0) {
        throw new ActionError("Add players first", 400);
      }
      await setSeats(
        id,
        context.seatsPerTable,
        players.map((player) => player.id),
      );
      return;
    }

    case "clear-seats": {
      requireOwner(actor);
      await query(`delete from seats where tournament_id = $1`, [id]);
      await query(`delete from tables where tournament_id = $1`, [id]);
      return;
    }

    case "move-player": {
      requireOwner(actor);
      await movePlayer(id, action.playerId, action.toTable, action.toSeat);
      return;
    }

    case "update-config": {
      requireOwner(actor);
      const merged = { ...config, ...action.config };
      await query(
        `update tournaments
         set config = $2,
             name = coalesce($3, name),
             date = coalesce($4::date, date),
             seats_per_table = coalesce($5, seats_per_table)
         where id = $1`,
        [
          id,
          JSON.stringify(merged),
          action.config.name ?? null,
          action.config.date ?? null,
          action.seatsPerTable ?? null,
        ],
      );
      return;
    }

    case "announce-all-in": {
      await requireAuthorityOver(actor, context, action.playerId);
      // A double tap should not flash twice; the same player being all in again inside
      // a few seconds is the same moment as far as the room is concerned.
      await query(
        `insert into announcements (tournament_id, player_id, kind)
         select $1, $2, 'all-in'
         where not exists (
           select 1 from announcements
           where tournament_id = $1 and player_id = $2 and kind = 'all-in'
             and created_at > now() - interval '8 seconds'
         )`,
        [id, action.playerId],
      );
      return;
    }

    case "set-host-player": {
      requireOwner(actor);
      await serializable(async (client) => {
        await client.query(`update tournaments set host_player_id = $2 where id = $1`, [
          id,
          action.playerId,
        ]);
        if (action.playerId === null) {
          return;
        }
        await seatHostAsCaptain(client, id);
      });
      return;
    }

    case "assign-captain": {
      requireOwner(actor);
      await query(
        `update tables
         set captain_player_id = $3,
             captain_claimed_at = case when $3::uuid is null then null else now() end
         where tournament_id = $1 and table_number = $2`,
        [id, action.tableNumber, action.playerId],
      );
      return;
    }
  }
}
