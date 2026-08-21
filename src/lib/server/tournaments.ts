import { query } from "./db";
import { readClock } from "../clock";
import type {
  Announcement,
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
  started_at: Date | null;
  paused_at: Date | null;
  paused_ms: string;
  owner_token: string;
  host_player_id: string | null;
}

interface PlayerRow {
  id: string;
  tournament_id: string;
  name: string;
  profile_id: string | null;
  has_avatar: boolean;
  rebuys: number;
  has_addon: boolean;
  is_active: boolean;
  finish_position: number | null;
  chip_count: number | null;
  chips_updated_at: Date | null;
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
  id: string;
  tournament_id: string;
  player_id: string;
  created_at: Date;
}

interface AnnouncementRow {
  id: string;
  tournament_id: string;
  player_id: string;
  kind: "all-in";
  created_at: Date;
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
  current_level_index, level_started_at, paused_at, paused_ms, owner_token, host_player_id,
  started_at
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
    profileId: row.profile_id ?? undefined,
    hasAvatar: row.has_avatar === true,
    rebuys: row.rebuys,
    hasAddon: row.has_addon,
    isActive: row.is_active,
    finishPosition: row.finish_position ?? undefined,
    chipCount: row.chip_count ?? undefined,
    chipsUpdatedAt: row.chips_updated_at?.toISOString() ?? undefined,
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
  announcements: AnnouncementRow[],
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

  const named = new Map(players.map((player) => [player.id, player]));
  const RECENT_MS = 30_000;
  const now = Date.now();
  // Two sources, one stream: the client then needs a single watermark rather than
  // reconciling shouts against the knockout log itself.
  const recent: Announcement[] = [
    ...announcements.map((row) => ({
      id: `a:${row.id}`,
      kind: "all-in" as const,
      playerId: row.player_id,
      playerName: named.get(row.player_id)?.name ?? "Someone",
      profileId: named.get(row.player_id)?.profile_id ?? undefined,
      hasAvatar: named.get(row.player_id)?.has_avatar === true,
      at: row.created_at.toISOString(),
    })),
    ...knockouts
      .filter((row) => now - row.created_at.getTime() < RECENT_MS)
      .map((row) => ({
        id: `k:${row.id}`,
        kind: "eliminated" as const,
        playerId: row.player_id,
        playerName: named.get(row.player_id)?.name ?? "Someone",
        profileId: named.get(row.player_id)?.profile_id ?? undefined,
        hasAvatar: named.get(row.player_id)?.has_avatar === true,
        at: row.created_at.toISOString(),
        finishPosition: named.get(row.player_id)?.finish_position ?? undefined,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));

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
    startedAt: row.started_at?.toISOString() ?? null,
    knockoutOrder: knockouts.map((knockout) => knockout.player_id),
    seatAssignments: seatAssignments.length > 0 ? seatAssignments : undefined,
    code: row.code,
    anchor,
    seatsPerTable: row.seats_per_table,
    hostPlayerId: row.host_player_id ?? undefined,
    tables: tableInfo,
    announcements: recent,
    proposals: proposals.map(toProposal),
  };
}

async function hydrate(rows: TournamentRow[]): Promise<Tournament[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);

  const [players, tables, seats, knockouts, announcements, proposals] = await Promise.all([
    query<PlayerRow>(
      `select p.id, p.tournament_id, p.name, p.profile_id, p.rebuys, p.has_addon, p.is_active,
              p.finish_position, p.chip_count, p.chips_updated_at, p.knocked_out_in_level,
              p.knocked_out_by,
              (pr.avatar is not null) as has_avatar
       from players p
       left join profiles pr on pr.id = p.profile_id
       where p.tournament_id = any($1) order by p.checked_in_at, p.id`,
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
      `select id, tournament_id, player_id, created_at from knockouts
       where tournament_id = any($1) order by id`,
      [ids],
    ),
    query<AnnouncementRow>(
      `select id, tournament_id, player_id, kind, created_at from announcements
       where tournament_id = any($1) and created_at > now() - interval '30 seconds'
       order by id`,
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
  const announcementsBy = groupBy(announcements, (row) => row.tournament_id);

  return rows.map((row) =>
    assemble(
      row,
      playersBy.get(row.id) ?? [],
      tablesBy.get(row.id) ?? [],
      seatsBy.get(row.id) ?? [],
      knockoutsBy.get(row.id) ?? [],
      proposalsBy.get(row.id) ?? [],
      announcementsBy.get(row.id) ?? [],
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
