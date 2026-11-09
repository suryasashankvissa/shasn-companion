-- Run this ONCE in Supabase > SQL Editor (safe to run again).
-- Adds the "End this game / who won?" feature and the printed-card colours.

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

-- Ideology colours matching the physical cards (only changes the 4 base ones).
update ideology_types set color = '#6fae3a' where name = 'The Capitalist';
update ideology_types set color = '#e9ae22' where name = 'The Idealist';
update ideology_types set color = '#2f43b4' where name = 'The Showstopper';
update ideology_types set color = '#e2483a' where name = 'The Supremo';
