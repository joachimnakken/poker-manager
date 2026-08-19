import { query, serializable } from "./db";
import { calculatePayouts, type PotEntry } from "../prize-calculator";
import type { ProfileStats } from "../api";
import type { TournamentConfig } from "../types";

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  profileToken: string;
}

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  profile_token: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    profileToken: row.profile_token,
  };
}

/**
 * The identity model across poker nights: a person IS their normalized name. A phone
 * that lost its localStorage re-attaches by typing the same name again. First-entered
 * casing wins, so "McRae" doesn't become "mcrae" when a friend types it lazily.
 */
export async function findOrCreateProfile(firstName: string, lastName: string): Promise<Profile> {
  const [row] = await query<ProfileRow>(
    `insert into profiles (first_name, last_name) values ($1, $2)
     on conflict (lower(first_name), lower(last_name))
     do update set first_name = profiles.first_name
     returning id, first_name, last_name, profile_token`,
    [firstName.trim(), lastName.trim()],
  );
  return toProfile(row);
}

export async function profileByToken(token: string): Promise<Profile | null> {
  const [row] = await query<ProfileRow>(
    `select id, first_name, last_name, profile_token from profiles where profile_token = $1`,
    [token],
  );
  return row ? toProfile(row) : null;
}

/**
 * Career stats for every profile, replayed from the finished tournaments each time.
 * Nothing is denormalized: a host undoing a knockout in an old game, or deleting a
 * tournament outright, changes everyone's record on the next read. The dataset is a
 * friend group's poker history — a handful of queries over hundreds of rows, not a
 * reporting problem.
 */
export async function leaderboard(): Promise<ProfileStats[]> {
  const [profiles, tournaments, players, knockouts] = await Promise.all([
    query<ProfileRow>(
      `select id, first_name, last_name, profile_token from profiles
       order by created_at`,
    ),
    query<{ id: string; config: TournamentConfig; entries: PotEntry[] | null }>(
      `select t.id, t.config,
              (select json_agg(json_build_object('rebuys', p.rebuys, 'hasAddon', p.has_addon))
               from players p where p.tournament_id = t.id) as entries
       from tournaments t where t.status = 'finished'
       order by t.date, t.created_at`,
    ),
    query<{ tournament_id: string; profile_id: string; finish_position: number | null }>(
      `select p.tournament_id, p.profile_id, p.finish_position
       from players p join tournaments t on t.id = p.tournament_id
       where t.status = 'finished' and p.profile_id is not null`,
    ),
    query<{ profile_id: string; n: number }>(
      `select p.profile_id, count(*)::int as n
       from knockouts k
       join players p on p.id = k.by_player_id
       join tournaments t on t.id = k.tournament_id
       where t.status = 'finished' and p.profile_id is not null
       group by p.profile_id`,
    ),
  ]);

  const payoutsByTournament = new Map<
    string,
    { amounts: Map<number, number>; currency: string }
  >();
  for (const tournament of tournaments) {
    const amounts = new Map<number, number>();
    for (const payout of calculatePayouts(tournament.entries ?? [], tournament.config)) {
      amounts.set(payout.position, payout.amount);
    }
    payoutsByTournament.set(tournament.id, {
      amounts,
      currency: tournament.config.currency,
    });
  }

  const knockoutsByProfile = new Map(knockouts.map((row) => [row.profile_id, row.n]));

  const stats = new Map<string, ProfileStats>(
    profiles.map((row) => [
      row.id,
      {
        profileId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        nights: 0,
        wins: 0,
        knockouts: knockoutsByProfile.get(row.id) ?? 0,
        bestFinish: null,
        winnings: 0,
        currency: null,
      },
    ]),
  );

  // Tournaments arrive date-ascending, so `currency` ends up as the most recent night's.
  for (const tournament of tournaments) {
    const payout = payoutsByTournament.get(tournament.id)!;
    for (const row of players) {
      if (row.tournament_id !== tournament.id) {
        continue;
      }
      const entry = stats.get(row.profile_id);
      if (!entry) {
        continue;
      }
      entry.nights += 1;
      entry.currency = payout.currency;
      if (row.finish_position !== null) {
        if (row.finish_position === 1) {
          entry.wins += 1;
        }
        if (entry.bestFinish === null || row.finish_position < entry.bestFinish) {
          entry.bestFinish = row.finish_position;
        }
        entry.winnings += payout.amounts.get(row.finish_position) ?? 0;
      }
    }
  }

  return [...stats.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winnings - a.winnings ||
      b.knockouts - a.knockouts ||
      b.nights - a.nights ||
      a.firstName.localeCompare(b.firstName),
  );
}

export async function statsForProfile(profileId: string): Promise<ProfileStats | null> {
  const all = await leaderboard();
  return all.find((entry) => entry.profileId === profileId) ?? null;
}

export interface NightPlayed {
  code: string;
  name: string;
  date: string;
  players: number;
  finishPosition: number | null;
  winnings: number;
  currency: string;
}

/**
 * The nights this profile has played, newest first. Finished tournaments only, matching
 * the leaderboard — a night still in progress has no placing to report yet.
 */
export async function profileHistory(profileId: string): Promise<NightPlayed[]> {
  const rows = await query<{
    code: string;
    name: string;
    date: string;
    config: TournamentConfig;
    finish_position: number | null;
    players: number;
    entries: PotEntry[] | null;
  }>(
    `select t.code, t.name, to_char(t.date, 'YYYY-MM-DD') as date, t.config,
            p.finish_position,
            (select count(*)::int from players x where x.tournament_id = t.id) as players,
            (select json_agg(json_build_object('rebuys', x.rebuys, 'hasAddon', x.has_addon))
             from players x where x.tournament_id = t.id) as entries
     from players p
     join tournaments t on t.id = p.tournament_id
     where p.profile_id = $1 and t.status = 'finished'
     order by t.date desc, t.created_at desc`,
    [profileId],
  );

  return rows.map((row) => {
    const payout = calculatePayouts(row.entries ?? [], row.config).find(
      (entry) => entry.position === row.finish_position,
    );
    return {
      code: row.code,
      name: row.name,
      date: row.date,
      players: row.players,
      finishPosition: row.finish_position,
      winnings: payout?.amount ?? 0,
      currency: row.config.currency,
    };
  });
}

/**
 * Renames a profile, and the player rows that point at it in tournaments still running,
 * so a rename does not leave an old name at the table. Names are unique per profile and
 * per tournament, so a clash is reported rather than silently dropped.
 */
export async function renameProfile(
  profileId: string,
  firstName: string,
  lastName: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const full = `${firstName.trim()} ${lastName.trim()}`;
  try {
    await serializable(async (client) => {
      await client.query(`update profiles set first_name = $2, last_name = $3 where id = $1`, [
        profileId,
        firstName.trim(),
        lastName.trim(),
      ]);
      await client.query(
        `update players p set name = $2
         from tournaments t
         where p.profile_id = $1 and t.id = p.tournament_id and t.status <> 'finished'`,
        [profileId, full],
      );
    });
    return { ok: true };
  } catch (error) {
    // 23505 is the unique index: either the name is another profile's, or someone at a
    // table this profile is sitting at already goes by it.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "That name is already taken" };
    }
    throw error;
  }
}

/** Whether this profile already has a photo — the phone only offers the camera once. */
export async function profileHasAvatar(profileId: string): Promise<boolean> {
  const [row] = await query<{ has: boolean }>(
    `select (avatar is not null) as has from profiles where id = $1`,
    [profileId],
  );
  return row?.has === true;
}
