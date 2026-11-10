-- Run this ONCE in Supabase > SQL Editor (safe to run again).
-- Adds the Jumla card (claim, move, take over with both players' consent)

alter table games add column if not exists jumla_holder uuid;
alter table games add column if not exists jumla_ideology uuid;
alter table games add column if not exists jumla_buyer uuid;
alter table games add column if not exists jumla_buyer_ideology uuid;
alter table games add column if not exists jumla_price int;

-- Everything the Jumla card can do.
--   claim   : "I drew the Jumla card" -> place it under an ideologue
--   move    : holder moves it to another ideologue (on their own turn)
--   discard : holder gives it back to the box
--   request : another player asks to take it (pays the holder)
--   cancel  : that player withdraws the request
--   accept  : holder agrees (resources received) -> card changes hands
--   decline : holder refuses
create or replace function jumla(p_code text, p_token_hash text, p_action text, p_ideology uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g games; me players; v_price int;
begin
  select * into g from games where code = upper(p_code) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  me := _player_for(g.id, p_token_hash);
  if g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if p_ideology is not null and not exists (select 1 from ideology_types where id = p_ideology) then
    raise exception 'BAD_REQUEST';
  end if;

  if p_action = 'claim' then
    if g.jumla_holder is not null then raise exception 'JUMLA_TAKEN'; end if;
    if p_ideology is null then raise exception 'BAD_REQUEST'; end if;
    update games set jumla_holder = me.id, jumla_ideology = p_ideology,
      jumla_buyer = null, jumla_buyer_ideology = null, jumla_price = null where id = g.id;

  elsif p_action = 'move' then
    if g.jumla_holder is distinct from me.id then raise exception 'NOT_JUMLA_HOLDER'; end if;
    if me.seat <> g.active_seat then raise exception 'JUMLA_MOVE_TURN'; end if;
    if p_ideology is null then raise exception 'BAD_REQUEST'; end if;
    update games set jumla_ideology = p_ideology where id = g.id;

  elsif p_action = 'discard' then
    if g.jumla_holder is distinct from me.id then raise exception 'NOT_JUMLA_HOLDER'; end if;
    update games set jumla_holder = null, jumla_ideology = null,
      jumla_buyer = null, jumla_buyer_ideology = null, jumla_price = null where id = g.id;

  elsif p_action = 'request' then
    if g.jumla_holder is null or g.jumla_holder = me.id then raise exception 'BAD_REQUEST'; end if;
    if g.jumla_buyer is not null and g.jumla_buyer <> me.id then raise exception 'JUMLA_OFFER_PENDING'; end if;
    if p_ideology is null then raise exception 'BAD_REQUEST'; end if;
    -- Price = the Ideologue level the card sits on (holder's cards of that ideologue, Jumla included).
    select count(*) + 1 into v_price from turns
     where game_id = g.id and recipient_id = g.jumla_holder
       and snapshot ->> 'ideology_id' = g.jumla_ideology::text;
    update games set jumla_buyer = me.id, jumla_buyer_ideology = p_ideology, jumla_price = v_price where id = g.id;

  elsif p_action = 'cancel' then
    if g.jumla_buyer is distinct from me.id then raise exception 'BAD_REQUEST'; end if;
    update games set jumla_buyer = null, jumla_buyer_ideology = null, jumla_price = null where id = g.id;

  elsif p_action = 'decline' then
    if g.jumla_holder is distinct from me.id then raise exception 'NOT_JUMLA_HOLDER'; end if;
    update games set jumla_buyer = null, jumla_buyer_ideology = null, jumla_price = null where id = g.id;

  elsif p_action = 'accept' then
    if g.jumla_holder is distinct from me.id then raise exception 'NOT_JUMLA_HOLDER'; end if;
    if g.jumla_buyer is null then raise exception 'BAD_REQUEST'; end if;
    update games set jumla_holder = g.jumla_buyer, jumla_ideology = g.jumla_buyer_ideology,
      jumla_buyer = null, jumla_buyer_ideology = null, jumla_price = null where id = g.id;

  else
    raise exception 'BAD_REQUEST';
  end if;

  update games set updated_at = now() where id = g.id;
end $$;

revoke all on function jumla(text,text,text,uuid) from public, anon, authenticated;
grant execute on function jumla(text,text,text,uuid) to service_role;
