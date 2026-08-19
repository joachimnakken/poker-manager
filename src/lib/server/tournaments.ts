import { query } from "./db";
import { readClock } from "../clock";
import type {
  ClockAnchor,
  Player,
  Proposal,
  ProposalStatus,
  SeatAssignment,
  TableInfo,
  Tournament,
  TournamentConfig,
  TournamentStatus,
} from "../types";
import { DEFAULT_BLIND_STRUCTURE, DEFAULT_CONFIG } from "../constants";
import { CODE_ALPHABET, CODE_LENGTH } from "../join-code";

interface TournamentRow {
  id: string;
  code: string;
  name: string;
  date: string;
  status: TournamentStatus;
  config: TournamentConfig;
  seats_per_table: number;
  current_level_index: number;
  level_started_at: Date | null;
  paused_at: Date | null;
  paused_ms: string;
  owner_token: string;
  host_player_id: string | null;
}

interface PlayerRow {
  id: string;
  tournament_id: string;
  name: string;
  rebuys: number;
  has_addon: boolean;
  is_active: boolean;
  finish_position: number | null;
  knocked_out_in_level: number | null;
  knocked_out_by: string | null;
}

interface TableRow {
  tournament_id: string;
  table_number: number;
  captain_player_id: string | null;
}

interface SeatRow {
  tournament_id: string;
  player_id: string;
  table_number: number;
  seat_number: number;
}

interface KnockoutRow {
  tournament_id: string;
  player_id: string;
}

interface ProposalRow {
  id: string;
  tournament_id: string;
  player_id: string;
  from_table: number;
  from_seat: number;
  to_table: number;
  to_seat: number;
  proposed_at: Date;
  from_confirmed_at: Date | null;
  to_confirmed_at: Date | null;
  status: ProposalStatus;
  decline_reason: string | null;
}

// `date` is a DATE column; node-pg would hand back a Date at local midnight, which
// shifts the day in negative-offset zones. Read it as text instead.
const TOURNAMENT_COLUMNS = `
  id, code, name, to_char(date, 'YYYY-MM-DD') as date, status, config, seats_per_table,
  current_level_index, level_started_at, paused_at, paused_ms, owner_token, host_player_id
`;

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = map.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(id, [row]);
    }
  }
  return map;
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    rebuys: row.rebuys,
    hasAddon: row.has_addon,
    isActive: row.is_active,
    finishPosition: row.finish_position ?? undefined,
    knockedOutInLevel: row.knocked_out_in_level ?? undefined,
    knockedOutBy: row.knocked_out_by ?? undefined,
  };
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    playerId: row.player_id,
    fromTable: row.from_table,
    fromSeat: row.from_seat,
    toTable: row.to_table,
    toSeat: row.to_seat,
    proposedAt: row.proposed_at.toISOString(),
    fromConfirmedAt: row.from_confirmed_at?.toISOString(),
    toConfirmedAt: row.to_confirmed_at?.toISOString(),
    status: row.status,
    declineReason: row.decline_reason ?? undefined,
  };
}

function assemble(
  row: TournamentRow,
  players: PlayerRow[],
  tables: TableRow[],
  seats: SeatRow[],
  knockouts: KnockoutRow[],
  proposals: ProposalRow[],
): Tournament {
  const config: TournamentConfig = {
    ...row.config,
    id: row.code,
    name: row.name,
    date: row.date,
  };

  const anchor: ClockAnchor = {
    currentLevelIndex: row.current_level_index,
    levelStartedAt: row.level_started_at?.toISOString() ?? null,
    pausedAt: row.paused_at?.toISOString() ?? null,
    pausedMs: Number(row.paused_ms),
  };

  const seatAssignments: SeatAssignment[] = seats.map((seat) => ({
    playerId: seat.player_id,
    seat: seat.seat_number,
    table: seat.table_number,
  }));

  const tableInfo: TableInfo[] = tables.map((table) => ({
    tableNumber: table.table_number,
    captainPlayerId: table.captain_player_id ?? undefined,
  }));

  // The clock reading here is a server-side snapshot so a first paint is correct;
  // every client recomputes it from `anchor` against its own serverNow offset.
  const reading = readClock(anchor, config.blindStructure);

  return {
    config,
    players: players.map(toPlayer),
    timer: {
      currentLevelIndex: anchor.currentLevelIndex,
      secondsRemaining: reading.secondsRemaining,
      isRunning: reading.isRunning,
    },
    status: row.status,
    knockoutOrder: knockouts.map((knockout) => knockout.player_id),
    seatAssignments: seatAssignments.length > 0 ? seatAssignments : undefined,
    code: row.code,
    anchor,
    seatsPerTable: row.seats_per_table,
    hostPlayerId: row.host_player_id ?? undefined,
    tables: tableInfo,
    proposals: proposals.map(toProposal),
  };
}

async function hydrate(rows: TournamentRow[]): Promise<Tournament[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);

  const [players, tables, seats, knockouts, proposals] = await Promise.all([
    query<PlayerRow>(
      `select id, tournament_id, name, rebuys, has_addon, is_active, finish_position,
              knocked_out_in_level, knocked_out_by
       from players where tournament_id = any($1) order by checked_in_at, id`,
      [ids],
    ),
    query<TableRow>(
      `select tournament_id, table_number, captain_player_id
       from tables where tournament_id = any($1) order by table_number`,
      [ids],
    ),
    query<SeatRow>(
      `select tournament_id, player_id, table_number, seat_number
       from seats where tournament_id = any($1) order by table_number, seat_number`,
      [ids],
    ),
    query<KnockoutRow>(
      `select tournament_id, player_id from knockouts where tournament_id = any($1) order by id`,
      [ids],
    ),
    query<ProposalRow>(
      `select id, tournament_id, player_id, from_table, from_seat, to_table, to_seat,
              proposed_at, from_confirmed_at, to_confirmed_at, status, decline_reason
       from proposals
       where tournament_id = any($1)
         and (status = 'pending'
              or (status = 'declined' and proposed_at > now() - interval '10 minutes'))
       order by proposed_at`,
      [ids],
    ),
  ]);

  const playersBy = groupBy(players, (row) => row.tournament_id);
  const tablesBy = groupBy(tables, (row) => row.tournament_id);
  const seatsBy = groupBy(seats, (row) => row.tournament_id);
  const knockoutsBy = groupBy(knockouts, (row) => row.tournament_id);
  const proposalsBy = groupBy(proposals, (row) => row.tournament_id);

  return rows.map((row) =>
    assemble(
      row,
      playersBy.get(row.id) ?? [],
      tablesBy.get(row.id) ?? [],
      seatsBy.get(row.id) ?? [],
      knockoutsBy.get(row.id) ?? [],
      proposalsBy.get(row.id) ?? [],
    ),
  );
}

export async function loadTournament(code: string): Promise<Tournament | null> {
  const rows = await query<TournamentRow>(
    `select ${TOURNAMENT_COLUMNS} from tournaments where code = $1`,
    [code.toUpperCase()],
  );
  const [tournament] = await hydrate(rows);
  return tournament ?? null;
}

export async function listTournaments(): Promise<Tournament[]> {
  const rows = await query<TournamentRow>(
    `select ${TOURNAMENT_COLUMNS} from tournaments order by date desc, created_at desc limit 50`,
  );
  return hydrate(rows);
}

/** Internal uuid + owner token for a code. Routes need these; clients never see the uuid. */
export async function resolveTournament(
  code: string,
): Promise<{ id: string; ownerToken: string; status: TournamentStatus } | null> {
  const [row] = await query<{ id: string; owner_token: string; status: TournamentStatus }>(
    `select id, owner_token, status from tournaments where code = $1`,
    [code.toUpperCase()],
  );
  return row ? { id: row.id, ownerToken: row.owner_token, status: row.status } : null;
}

// No I/O/0/1 — these get read off a projector and typed into a phone.
function randomCode(length = CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function createTournament(
  name: string,
  date: string,
  config?: Partial<TournamentConfig>,
): Promise<{ code: string; ownerToken: string }> {
  const fullConfig: TournamentConfig = {
    id: "",
    name,
    date,
    ...DEFAULT_CONFIG,
    blindStructure: [...DEFAULT_BLIND_STRUCTURE],
    payoutPercentages: [],
    ...config,
  };

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const rows = await query<{ code: string; owner_token: string }>(
      `insert into tournaments (code, name, date, config)
       values ($1, $2, $3, $4)
       on conflict (code) do nothing
       returning code, owner_token`,
      [code, name, date, JSON.stringify(fullConfig)],
    );
    if (rows.length > 0) {
      return { code: rows[0].code, ownerToken: rows[0].owner_token };
    }
  }
  throw new Error("Could not allocate a unique tournament code");
}

export async function deleteTournament(code: string): Promise<void> {
  await query(`delete from tournaments where code = $1`, [code.toUpperCase()]);
}
