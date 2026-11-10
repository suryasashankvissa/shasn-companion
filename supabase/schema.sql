-- =====================================================================
-- Shasn Campaign Companion — database schema
-- Safe to re-run: it only creates things that don't exist yet and
-- replaces the game functions with their latest version.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Campaign content (edited in the admin area) ----------

create table if not exists ideology_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#8a8f98',
  symbol      text not null default '◆',
  description text not null default '',
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists decks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  cover_color     text not null default '#1d2b4a',
  cover_image_url text not null default '',
  status          text not null default 'draft' check (status in ('draft','published')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists questions (
  id               uuid primary key default gen_random_uuid(),
  deck_id          uuid not null references decks(id) on delete cascade,
  number           int  not null default 0,
  text             text not null default '',
  yes_label        text not null default 'Yes',
  yes_ideology_id  uuid references ideology_types(id) on delete set null,
  yes_card_text    text not null default '',
  yes_resources    text not null default '',
  yes_recipient    text not null default 'answerer' check (yes_recipient in ('answerer','next','previous')),
  no_label         text not null default 'No',
  no_ideology_id   uuid references ideology_types(id) on delete set null,
  no_card_text     text not null default '',
  no_resources     text not null default '',
  no_recipient     text not null default 'answerer' check (no_recipient in ('answerer','next','previous')),
  created_at       timestamptz not null default now()
);
create index if not exists questions_deck_idx on questions(deck_id);

-- Email addresses allowed to use the admin area.
create table if not exists admins (
  email text primary key
);

-- ---------- Live games (only the server touches these) ----------

create table if not exists games (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  deck_id             uuid not null references decks(id) on delete cascade,
  max_players         int  not null check (max_players between 2 and 8),
  status              text not null default 'lobby' check (status in ('lobby','playing','finished')),
  host_player_id      uuid,
  active_seat         int  not null default 1,
  question_seq        int  not null default 0,
  current_question_id uuid references questions(id) on delete set null,
  deck_order          uuid[] not null default '{}',
  deck_pos            int  not null default 0,
  reshuffles          int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  name       text not null,
  seat       int  not null,
  is_host    boolean not null default false,
  token_hash text not null,
  joined_at  timestamptz not null default now(),
  unique (game_id, seat)
);
create unique index if not exists players_unique_name on players(game_id, lower(name));

create table if not exists turns (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references games(id) on delete cascade,
  seq          int  not null,
  question_id  uuid references questions(id) on delete set null,
  answerer_id  uuid not null references players(id) on delete cascade,
  recipient_id uuid not null references players(id) on delete cascade,
  choice       text not null check (choice in ('yes','no')),
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  unique (game_id, seq)          -- one answer per question, enforced by the database
);

-- ---------- Security ----------

alter table ideology_types enable row level security;
alter table decks          enable row level security;
alter table questions      enable row level security;
alter table admins         enable row level security;
alter table games          enable row level security;
alter table players        enable row level security;
alter table turns          enable row level security;
-- games / players / turns have NO policies: browsers can never read or
-- write them directly. Only the app's server (service role) can.

-- Explicit table permissions (row-level security above still applies).
grant select, insert, update, delete on ideology_types, decks, questions to authenticated;
grant select on admins to authenticated;
grant all on all tables in schema public to service_role;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_ideology_types') then
    create policy admin_all_ideology_types on ideology_types for all to authenticated using (is_admin()) with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_all_decks') then
    create policy admin_all_decks on decks for all to authenticated using (is_admin()) with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_all_questions') then
    create policy admin_all_questions on questions for all to authenticated using (is_admin()) with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_read_admins') then
    create policy admin_read_admins on admins for select to authenticated using (is_admin());
  end if;
end $$;

-- =====================================================================
-- Game rules. Every function locks the game row, so two taps arriving
-- at the same moment are handled one after the other.
-- =====================================================================

create or replace function _player_for(p_game_id uuid, p_token_hash text)
returns players language plpgsql as $$
declare v players;
begin
  select * into v from players where game_id = p_game_id and token_hash = p_token_hash;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  return v;
end $$;

-- Moves to the next card in the shuffled deck, reshuffling when it runs out.
create or replace function _draw_next(p_game_id uuid) returns void
language plpgsql as $$
declare g games; v_order uuid[];
begin
  select * into g from games where id = p_game_id;
  if g.deck_pos + 1 <= coalesce(array_length(g.deck_order, 1), 0) then
    update games set deck_pos = g.deck_pos + 1,
                     current_question_id = g.deck_order[g.deck_pos + 1],
                     updated_at = now()
     where id = p_game_id;
  else
    select array_agg(id order by random()) into v_order
      from questions
     where deck_id = g.deck_id and yes_ideology_id is not null and no_ideology_id is not null;
    if v_order is null then raise exception 'DECK_EMPTY'; end if;
    -- avoid showing the same card twice in a row after a reshuffle
    if array_length(v_order, 1) > 1 and v_order[1] = g.current_question_id then
      v_order := v_order[2:] || v_order[1];
    end if;
    update games set deck_order = v_order, deck_pos = 1,
                     current_question_id = v_order[1],
                     reshuffles = g.reshuffles + 1,
                     updated_at = now()
     where id = p_game_id;
  end if;
end $$;

create or replace function create_game(p_deck_id uuid, p_max_players int, p_host_name text, p_token_hash text)
returns table (game_code text, player_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_game uuid; v_player uuid; v_name text := btrim(p_host_name);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if length(v_name) > 24 then raise exception 'NAME_TOO_LONG'; end if;
  if p_max_players < 2 or p_max_players > 8 then raise exception 'BAD_PLAYER_COUNT'; end if;
  if not exists (select 1 from decks where id = p_deck_id and status = 'published') then
    raise exception 'DECK_NOT_AVAILABLE';
  end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from games where code = v_code);
  end loop;
  insert into games (code, deck_id, max_players) values (v_code, p_deck_id, p_max_players) returning id into v_game;
  insert into players (game_id, name, seat, is_host, token_hash) values (v_game, v_name, 1, true, p_token_hash) returning id into v_player;
  update games set host_player_id = v_player where id = v_game;
  return query select v_code, v_player;
end $$;

create or replace function join_game(p_code text, p_name text, p_token_hash text, p_reclaim boolean)
returns table (player_id uuid, reclaimed boolean)
language plpgsql security definer set search_path = public as $$
declare g games; existing players; v_name text := btrim(p_name); v_count int; v_id uuid;
begin
  select * into g from games where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if length(v_name) > 24 then raise exception 'NAME_TOO_LONG'; end if;

  select * into existing from players where game_id = g.id and lower(name) = lower(v_name);
  if found then
    if not p_reclaim then raise exception 'NAME_TAKEN'; end if;
    -- Reconnecting on a new device / after clearing the browser: same seat, new key.
    update players set token_hash = p_token_hash where id = existing.id;
    update games set updated_at = now() where id = g.id;
    return query select existing.id, true;
    return;
  end if;

  if g.status <> 'lobby' then raise exception 'GAME_STARTED'; end if;
  select count(*) into v_count from players where game_id = g.id;
  if v_count >= g.max_players then raise exception 'GAME_FULL'; end if;

  insert into players (game_id, name, seat, is_host, token_hash)
  values (g.id, v_name, (select coalesce(max(seat), 0) + 1 from players where game_id = g.id), false, p_token_hash)
  returning id into v_id;
  update games set updated_at = now() where id = g.id;
  return query select v_id, false;
end $$;

create or replace function start_game(p_code text, p_token_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare g games; me players; v_count int;
begin
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if not me.is_host then raise exception 'HOST_ONLY'; end if;
  if g.status <> 'lobby' then raise exception 'GAME_STARTED'; end if;
  select count(*) into v_count from players where game_id = g.id;
  if v_count < 2 then raise exception 'NEED_MORE_PLAYERS'; end if;
  update games set status = 'playing', active_seat = 1, question_seq = 1,
                   deck_order = '{}', deck_pos = 0, reshuffles = -1
   where id = g.id;
  perform _draw_next(g.id);  -- first shuffle (sets reshuffles back to 0)
end $$;

create or replace function answer_question(p_code text, p_token_hash text, p_question_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games; me players; q questions; v_ideology ideology_types;
  v_rule text; v_count int; v_recipient players; v_recipient_seat int;
begin
  if p_choice not in ('yes','no') then raise exception 'BAD_CHOICE'; end if;
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if me.seat <> g.active_seat then raise exception 'NOT_YOUR_TURN'; end if;
  if exists (select 1 from turns where game_id = g.id and seq = g.question_seq) then
    raise exception 'ALREADY_ANSWERED';
  end if;
  if p_question_id is distinct from g.current_question_id then raise exception 'QUESTION_CHANGED'; end if;

  select * into q from questions where id = g.current_question_id;
  if not found then raise exception 'QUESTION_MISSING'; end if;

  select * into v_ideology from ideology_types
   where id = case when p_choice = 'yes' then q.yes_ideology_id else q.no_ideology_id end;
  v_rule := case when p_choice = 'yes' then q.yes_recipient else q.no_recipient end;

  select count(*) into v_count from players where game_id = g.id;
  v_recipient_seat := case v_rule
    when 'next'     then (me.seat % v_count) + 1
    when 'previous' then ((me.seat - 2 + v_count) % v_count) + 1
    else me.seat end;
  select * into v_recipient from players where game_id = g.id and seat = v_recipient_seat;

  insert into turns (game_id, seq, question_id, answerer_id, recipient_id, choice, snapshot)
  values (g.id, g.question_seq, q.id, me.id, v_recipient.id, p_choice, jsonb_build_object(
    'number',        q.number,
    'question',      q.text,
    'label',         case when p_choice = 'yes' then q.yes_label else q.no_label end,
    'card_text',     case when p_choice = 'yes' then q.yes_card_text else q.no_card_text end,
    'resources',     case when p_choice = 'yes' then q.yes_resources else q.no_resources end,
    'ideology_id',   v_ideology.id,
    'ideology_name', coalesce(v_ideology.name, 'Unknown'),
    'ideology_color',coalesce(v_ideology.color, '#8a8f98'),
    'ideology_symbol',coalesce(v_ideology.symbol, '◆'),
    'ideology_description', coalesce(v_ideology.description, '')
  ));
  update games set updated_at = now() where id = g.id;
end $$;

create or replace function next_question(p_code text, p_token_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare g games; me players; v_count int;
begin
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if not me.is_host then raise exception 'HOST_ONLY'; end if;
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if not exists (select 1 from turns where game_id = g.id and seq = g.question_seq) then
    raise exception 'NOT_ANSWERED_YET';
  end if;
  select count(*) into v_count from players where game_id = g.id;
  update games set active_seat = (g.active_seat % v_count) + 1,
                   question_seq = g.question_seq + 1
   where id = g.id;
  perform _draw_next(g.id);
end $$;

create or replace function redraw_question(p_code text, p_token_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare g games; me players;
begin
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if not me.is_host then raise exception 'HOST_ONLY'; end if;
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if exists (select 1 from turns where game_id = g.id and seq = g.question_seq) then
    raise exception 'ALREADY_ANSWERED';
  end if;
  perform _draw_next(g.id);  -- same player, new card
end $$;

-- Only the app's server may call the game functions.
revoke all on function create_game(uuid,int,text,text)            from public, anon, authenticated;
revoke all on function join_game(text,text,text,boolean)          from public, anon, authenticated;
revoke all on function start_game(text,text)                      from public, anon, authenticated;
revoke all on function answer_question(text,text,uuid,text)       from public, anon, authenticated;
revoke all on function next_question(text,text)                   from public, anon, authenticated;
revoke all on function redraw_question(text,text)                 from public, anon, authenticated;
revoke all on function _draw_next(uuid)                           from public, anon, authenticated;
revoke all on function _player_for(uuid,text)                     from public, anon, authenticated;
grant execute on function create_game(uuid,int,text,text)         to service_role;
grant execute on function join_game(text,text,text,boolean)       to service_role;
grant execute on function start_game(text,text)                   to service_role;
grant execute on function answer_question(text,text,uuid,text)    to service_role;
grant execute on function next_question(text,text)                to service_role;
grant execute on function redraw_question(text,text)              to service_role;

-- ---------- End game ----------

alter table games add column if not exists winner_id uuid;

create or replace function end_game(p_code text, p_token_hash text, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g games; me players;
begin
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if not me.is_host then raise exception 'HOST_ONLY'; end if;
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if not exists (select 1 from players where id = p_winner and game_id = g.id) then
    raise exception 'BAD_REQUEST';
  end if;
  update games set status = 'finished', winner_id = p_winner, updated_at = now() where id = g.id;
end $$;

revoke all on function end_game(text,text,uuid) from public, anon, authenticated;
grant execute on function end_game(text,text,uuid) to service_role;

-- ---------- Sensitive-topic marker ----------
alter table questions add column if not exists sensitive boolean not null default false;
