-- Poker tournament manager — multi-table schema.
-- Idempotent: safe to run repeatedly. See .plans/2026-08-17-multi-table-mobile.md.

create table if not exists tournaments (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  date                date not null,
  status              text not null default 'setup'
                        check (status in ('setup','running','paused','break','finished')),
  config              jsonb not null,
  seats_per_table     int  not null default 9 check (seats_per_table between 2 and 10),

  -- Clock anchor. secondsRemaining is never stored; clients derive it from these.
  current_level_index int  not null default 0,
  level_started_at    timestamptz,
  paused_at           timestamptz,
  paused_ms           bigint not null default 0,

  owner_token         uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now()
);

-- A person across poker nights. Check-in finds-or-creates by normalized name, so a
-- phone that lost its token re-attaches by typing the same name — consistent with
-- the home-game trust model: the token prevents accidents, not attacks.
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  profile_token uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now()
);

-- A small square JPEG, base64, taken at first check-in. Kept on the profile rather
-- than in blob storage because a friend group's worth of 200x200 thumbnails is a few
-- hundred kilobytes in total, and it is served from its own cached endpoint so it never
-- rides the tournament state that every phone polls.
alter table profiles add column if not exists avatar text;

create unique index if not exists profiles_name_idx
  on profiles (lower(first_name), lower(last_name));

create table if not exists players (
  id                    uuid primary key default gen_random_uuid(),
  tournament_id         uuid not null references tournaments(id) on delete cascade,
  name                  text not null,
  rebuys                int  not null default 0,
  has_addon             boolean not null default false,
  is_active             boolean not null default true,
  finish_position       int,
  knocked_out_in_level  int,
  knocked_out_by        uuid references players(id) on delete set null,
  player_token          uuid not null default gen_random_uuid(),
  checked_in_at         timestamptz not null default now(),
  unique (tournament_id, name)
);

alter table players add column if not exists
  profile_id uuid references profiles(id) on delete set null;
create index if not exists players_profile_idx on players(profile_id);

-- Counted stacks. Captains count their own table during a break, which turns the player
-- list into a live ranking. Nullable because a stack is unknown until someone counts it,
-- and the timestamp is what makes a count from two breaks ago visibly stale.
alter table players add column if not exists chip_count int check (chip_count >= 0);
alter table players add column if not exists chips_updated_at timestamptz;

-- Which player is the host. The host runs the night from their seat, so their player
-- token carries owner authority; the owner_token device designates them. Declared after
-- players because it points at one.
alter table tournaments add column if not exists
  host_player_id uuid references players(id) on delete set null;

create table if not exists tables (
  tournament_id     uuid not null references tournaments(id) on delete cascade,
  table_number      int  not null,
  captain_player_id uuid references players(id) on delete set null,
  captain_claimed_at timestamptz,
  primary key (tournament_id, table_number)
);

create table if not exists seats (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  table_number  int  not null,
  seat_number   int  not null,
  primary key (tournament_id, player_id),
  unique (tournament_id, table_number, seat_number)
);

-- Append-only and ordered. Finish position depends on how many were active at the
-- moment of the knockout, so writes here run in a SERIALIZABLE transaction.
create table if not exists knockouts (
  id            bigserial primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  by_player_id  uuid references players(id) on delete set null,
  level         int  not null,
  created_at    timestamptz not null default now()
);

-- Table-side shouts, for the room rather than the record: "he's all in". Append-only
-- with an id, so each device flashes only what is newer than the last one it showed --
-- a phone waking from a pocket must not replay a minute of them. Eliminations are not
-- in here; `knockouts` already carries an id and a timestamp and does the same job.
create table if not exists announcements (
  id            bigserial primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  kind          text not null check (kind in ('all-in')),
  created_at    timestamptz not null default now()
);

create index if not exists announcements_recent_idx
  on announcements (tournament_id, id desc);

create table if not exists proposals (
  id                uuid primary key default gen_random_uuid(),
  tournament_id     uuid not null references tournaments(id) on delete cascade,
  player_id         uuid not null references players(id) on delete cascade,
  from_table        int not null,
  from_seat         int not null,
  to_table          int not null,
  to_seat           int not null,
  proposed_at       timestamptz not null default now(),
  from_confirmed_at timestamptz,
  to_confirmed_at   timestamptz,
  status            text not null default 'pending'
                      check (status in ('pending','applied','declined','cancelled')),
  decline_reason    text
);

create index if not exists players_tournament_idx   on players(tournament_id);
create index if not exists seats_tournament_idx     on seats(tournament_id);
create index if not exists knockouts_tournament_idx on knockouts(tournament_id, id);
create index if not exists proposals_pending_idx    on proposals(tournament_id)
  where status = 'pending';
