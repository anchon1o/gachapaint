-- =====================================================================
-- GACHAPAINT · esquema para Supabase
-- Todas as táboas levan o prefixo gch_ para convivir con outros xogos
-- no mesmo proxecto. Pódese executar varias veces sen problema.
-- Ninguén le nin escribe as táboas directamente: todo pasa polas
-- funcións gch_* de abaixo, que comproban as regras do xogo.
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists gch_players(
  id         uuid primary key default gen_random_uuid(),
  secret     uuid not null unique default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 20),
  streak     int  not null default 0,
  last_day   date,
  drew_day   date,
  pulls_day  date,
  pulls      int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists gch_items(
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references gch_players(id) on delete cascade,
  author_name text not null,
  name        text not null check (char_length(name) between 1 and 40),
  value       int  not null check (value >= 0),
  img         text not null check (img ~ '^items/[0-9a-f-]{36}\.(webp|png)$'),  -- ruta en Storage
  owner_id    uuid references gch_players(id) on delete set null,
  in_pool     boolean not null default true,
  pending     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists gch_items_pool_idx  on gch_items(in_pool) where in_pool;
create index if not exists gch_items_owner_idx on gch_items(owner_id);
create unique index if not exists gch_items_img_idx on gch_items(img);

-- Storage: cartafol público "gachapaint" para os debuxos (máx. 100 KB cada un)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gachapaint', 'gachapaint', true, 102400, array['image/webp','image/png'])
on conflict (id) do update set public = true, file_size_limit = 102400,
  allowed_mime_types = array['image/webp','image/png'];
-- calquera pode subir un debuxo novo (non sobrescribir nin borrar), só co nome items/<uuid>.webp
drop policy if exists "gch subir debuxos" on storage.objects;
create policy "gch subir debuxos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gachapaint' and name ~ '^items/[0-9a-f-]{36}\.(webp|png)$');

-- estado xeral: se a máquina xa arrancou e cantos obxectos fan falta
create table if not exists gch_state(
  id      int primary key default 1 check (id = 1),
  started boolean not null default false,
  goal    int not null default 100
);
insert into gch_state(id) values (1) on conflict do nothing;

-- ampliacións (versión 2): pódese volver executar todo o ficheiro sen perder datos
alter table gch_players add column if not exists tandas_day date;
alter table gch_players add column if not exists tandas int not null default 0;
alter table gch_items   add column if not exists hidden boolean not null default false;

create table if not exists gch_reports(
  item_id    uuid not null references gch_items(id) on delete cascade,
  player_id  uuid not null references gch_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, player_id)
);

-- avisos ("a Marta tocoulle o teu debuxo", regalos) e historial para o álbum
create table if not exists gch_events(
  id           bigserial primary key,
  recipient_id uuid references gch_players(id) on delete cascade,  -- quen recibe o aviso (null = ninguén)
  taker_id     uuid references gch_players(id) on delete cascade,  -- quen se queda o obxecto (para o álbum)
  kind         text not null,                                      -- 'took' ou 'gift'
  actor_name   text not null,
  item_id      uuid references gch_items(id) on delete cascade,
  item_name    text not null,
  reaction     text,
  seen         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists gch_events_recipient_idx on gch_events(recipient_id) where not seen;
create index if not exists gch_events_taker_idx on gch_events(taker_id);

-- versión 3: prezos x10, galería pública e votos
alter table gch_state  add column if not exists version int not null default 1;
alter table gch_state  add column if not exists settled_week date;
alter table gch_items  add column if not exists public boolean not null default false;
alter table gch_events add column if not exists amount int;
create table if not exists gch_votes(
  item_id   uuid not null references gch_items(id) on delete cascade,
  player_id uuid not null references gch_players(id) on delete cascade,
  week      date not null,
  vote      smallint not null check (vote in (-1, 1)),
  primary key (item_id, player_id, week)
);
alter table gch_votes enable row level security;
revoke all on gch_votes from anon, authenticated;
-- multiplica por 10 os prezos que xa había (só se fai unha vez, aínda que executes o ficheiro máis veces)
do $$ begin
  if (select version from gch_state where id = 1) < 3 then
    update gch_items set value = value * 10;
    update gch_state set version = 3 where id = 1;
  end if;
end $$;

alter table gch_reports enable row level security;
alter table gch_events  enable row level security;
revoke all on gch_reports, gch_events from anon, authenticated;

alter table gch_players enable row level security;
alter table gch_items   enable row level security;
alter table gch_state   enable row level security;
revoke all on gch_players, gch_items, gch_state from anon, authenticated;

-- ------------------------- axudantes -------------------------
create or replace function gch_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create or replace function gch_budget(n int) returns int
language sql immutable as $$
  select case when n > 0 and n % 30 = 0 then 10000 when n > 0 and n % 10 = 0 then 5000 else 1000 end $$;

create or replace function gch_player(p_secret uuid) returns gch_players
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  select * into p from gch_players where secret = p_secret;
  if not found then raise exception 'gch:no_player'; end if;
  return p;
end $$;

create or replace function gch_item_json(i gch_items, me uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', i.id, 'name', i.name, 'value', i.value,
    'author', i.author_name, 'img', i.img, 'mine', i.author_id = me, 'public', i.public) $$;

create or replace function gch_me_json(p gch_players) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t date := gch_today(); s int; ns int; st gch_state; pend jsonb; inv jsonb; ev jsonb; drew boolean; h int; l int;
begin
  select * into st from gch_state where id = 1;
  s    := case when p.last_day >= t - 1 then p.streak else 0 end;
  ns   := case when p.last_day = t then p.streak when p.last_day = t - 1 then p.streak + 1 else 1 end;
  drew := coalesce(p.drew_day = t, false);
  select gch_item_json(i, p.id) into pend from gch_items i where i.owner_id = p.id and i.pending limit 1;
  select coalesce(jsonb_agg(gch_item_json(i, p.id) order by i.value desc), '[]'::jsonb) into inv
    from gch_items i where i.owner_id = p.id and not i.pending;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'who', e.actor_name,
           'item', e.item_name, 'reaction', e.reaction, 'amount', e.amount) order by e.created_at desc), '[]'::jsonb) into ev
    from (select * from gch_events where recipient_id = p.id and not seen order by created_at desc limit 20) e;
  select count(*) filter (where reaction = 'love'), count(*) filter (where reaction = 'meh') into h, l
    from gch_events where recipient_id = p.id and kind = 'took';
  return jsonb_build_object(
    'id', p.id, 'name', p.name, 'code', p.code, 'streak', s, 'next_streak', ns, 'budget', gch_budget(ns),
    'drew_today', drew,
    'pulls_left', case when st.started and drew
                       then greatest(0, 3 - case when p.pulls_day = t then p.pulls else 0 end) else 0 end,
    'tandas_left', case when st.started then null
                        else greatest(0, 5 - case when p.tandas_day = t then p.tandas else 0 end) end,
    'capacity', 20 + s / 7, 'started', st.started, 'goal', st.goal,
    'pending', pend, 'inventory', inv, 'events', ev, 'hearts', h, 'laughs', l);
end $$;

-- ------------------------- funcións públicas -------------------------
create or replace function gch_join(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  insert into gch_players(name, code) values (left(btrim(p_name), 20), gch_new_code()) returning * into p;
  return jsonb_build_object('secret', p.secret, 'me', gch_me_json(p));
end $$;

create or replace function gch_week() returns date
language sql stable as $$ select date_trunc('week', gch_today())::date $$;

-- cada luns: os votos da semana anterior cambian o valor (±¥10 por voto neto, nunca por debaixo de 0)
create or replace function gch_settle() returns void
language plpgsql security definer set search_path = public as $$
declare w date := gch_week(); st gch_state; r record;
begin
  select * into st from gch_state where id = 1;
  if st.settled_week is not null and st.settled_week >= w then return; end if;
  select * into st from gch_state where id = 1 for update;
  if st.settled_week is not null and st.settled_week >= w then return; end if;
  for r in select v.item_id, sum(v.vote)::int as sc from gch_votes v
           where v.week < w and (st.settled_week is null or v.week >= st.settled_week)
           group by v.item_id having sum(v.vote) <> 0 loop
    update gch_items set value = greatest(0, value + 10 * r.sc) where id = r.item_id;
    insert into gch_events(recipient_id, kind, actor_name, item_id, item_name, amount)
      select author_id, case when r.sc > 0 then 'rise' else 'fall' end, '', id, name, value
      from gch_items where id = r.item_id;
  end loop;
  update gch_state set settled_week = w where id = 1;
end $$;

create or replace function gch_me(p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform gch_settle(); return gch_me_json(gch_player(p_secret)); end $$;

create or replace function gch_rename(p_secret uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  p := gch_player(p_secret);
  update gch_players set name = left(btrim(p_name), 20) where id = p.id returning * into p;
  return gch_me_json(p);
end $$;

create or replace function gch_pool() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('started', st.started, 'goal', st.goal,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'value', value))
                       from gch_items where in_pool), '[]'::jsonb))
  from gch_state st where st.id = 1 $$;

create or replace function gch_submit(p_secret uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; st gch_state; t date := gch_today(); ns int; total int := 0; it jsonb; n int;
begin
  p := gch_player(p_secret);
  select * into st from gch_state where id = 1 for update;
  if st.started and p.drew_day = t then raise exception 'gch:already_drew'; end if;
  if not st.started and p.tandas_day = t and p.tandas >= 5 then raise exception 'gch:tanda_limit'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 3 then raise exception 'gch:bad_item'; end if;
  ns := case when p.last_day = t then p.streak when p.last_day = t - 1 then p.streak + 1 else 1 end;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'name'), '') = '' or coalesce(it->>'value', '') !~ '^\d+0$|^0$'
       or coalesce(it->>'img', '') !~ '^items/[0-9a-f-]{36}\.(webp|png)$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'gachapaint' and o.name = it->>'img')
       or exists (select 1 from gch_items g where g.img = it->>'img') then
      raise exception 'gch:bad_item';
    end if;
    total := total + (it->>'value')::int;
  end loop;
  if total <> gch_budget(ns) then raise exception 'gch:sum'; end if;
  insert into gch_items(author_id, author_name, name, value, img, public)
    select p.id, p.name, left(btrim(e->>'name'), 40), (e->>'value')::int, e->>'img', coalesce((e->>'public')::boolean, false)
    from jsonb_array_elements(p_items) e;
  update gch_players set streak = ns, last_day = t, drew_day = t,
    tandas = case when tandas_day = t then tandas + 1 else 1 end, tandas_day = t
    where id = p.id returning * into p;
  select count(*) into n from gch_items where in_pool;
  if not st.started and n >= st.goal then update gch_state set started = true where id = 1; end if;
  return gch_me_json(p);
end $$;

create or replace function gch_pull(p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; st gch_state; t date := gch_today(); i gch_items; used int;
begin
  p := gch_player(p_secret);
  select * into st from gch_state where id = 1;
  if not st.started then raise exception 'gch:not_started'; end if;
  if coalesce(p.drew_day <> t, true) then raise exception 'gch:need_draw'; end if;
  if exists (select 1 from gch_items where owner_id = p.id and pending) then raise exception 'gch:pending'; end if;
  used := case when p.pulls_day = t then p.pulls else 0 end;
  if used >= 3 then raise exception 'gch:no_pulls'; end if;
  -- sorteo con peso: os teus propios debuxos saen con menos probabilidade
  select * into i from gch_items where in_pool
    order by -ln(greatest(random(), 1e-9)) / case when author_id = p.id then 0.35 else 1 end
    limit 1 for update skip locked;
  if not found then raise exception 'gch:empty'; end if;
  update gch_items set in_pool = false, owner_id = p.id, pending = true where id = i.id returning * into i;
  update gch_players set pulls = used + 1, pulls_day = t where id = p.id;
  insert into gch_events(recipient_id, taker_id, kind, actor_name, item_id, item_name)
    values (case when i.author_id <> p.id then i.author_id end, p.id, 'took', p.name, i.id, i.name);
  return gch_item_json(i, p.id);
end $$;

create or replace function gch_keep(p_secret uuid, p_release uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; pend gch_items; t date := gch_today(); s int; cnt int;
begin
  p := gch_player(p_secret);
  select * into pend from gch_items where owner_id = p.id and pending for update;
  if not found then raise exception 'gch:no_pending'; end if;
  s := case when p.last_day >= t - 1 then p.streak else 0 end;
  select count(*) into cnt from gch_items where owner_id = p.id and not pending;
  if p_release is null then
    if cnt >= 20 + s / 7 then raise exception 'gch:full'; end if;
    update gch_items set pending = false where id = pend.id;
  else
    update gch_items set in_pool = true, owner_id = null, pending = false
      where id = p_release and owner_id = p.id;
    if not found then raise exception 'gch:bad_item'; end if;
    if p_release <> pend.id then update gch_items set pending = false where id = pend.id; end if;
  end if;
  return gch_me_json(p);
end $$;

create or replace function gch_release(p_secret uuid, p_item uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  p := gch_player(p_secret);
  update gch_items set in_pool = true, owner_id = null
    where id = p_item and owner_id = p.id and not pending;
  if not found then raise exception 'gch:bad_item'; end if;
  return gch_me_json(p);
end $$;

create or replace function gch_ranking(p_secret uuid) returns jsonb
language sql security definer set search_path = public as $$
  with x as (
    select pl.name, pl.secret = p_secret as me,
           coalesce(count(i.id), 0)::int as cnt, coalesce(sum(i.value), 0)::int as total
    from gch_players pl
    left join gch_items i on i.owner_id = pl.id and not i.pending
    group by pl.id)
  select jsonb_build_object(
    'rich', coalesce((select jsonb_agg(jsonb_build_object('name',name,'count',cnt,'total',total,'me',me) order by total desc, cnt desc)
                      from (select * from x order by total desc, cnt desc limit 50) a), '[]'::jsonb),
    'poor', coalesce((select jsonb_agg(jsonb_build_object('name',name,'count',cnt,'total',total,'me',me) order by total asc, cnt desc)
                      from (select * from x where cnt > 0 order by total asc, cnt desc limit 50) b), '[]'::jsonb)) $$;

-- ------------------------- versión 2 -------------------------
create or replace function gch_seen(p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  p := gch_player(p_secret);
  update gch_events set seen = true where recipient_id = p.id and not seen;
  return '{}'::jsonb;
end $$;

create or replace function gch_react(p_secret uuid, p_item uuid, p_reaction text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  p := gch_player(p_secret);
  if p_reaction not in ('love', 'meh') then raise exception 'gch:bad_item'; end if;
  update gch_events set reaction = p_reaction where id = (
    select id from gch_events where taker_id = p.id and item_id = p_item and kind = 'took'
    order by created_at desc limit 1);
  return '{}'::jsonb;
end $$;

-- denunciar: o obxecto sae do teu inventario (ou da bola aberta, e devólvese a tirada);
-- con 3 denuncias de persoas distintas queda oculto ata que o revises
create or replace function gch_report(p_secret uuid, p_item uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; i gch_items; n int; t date := gch_today();
begin
  p := gch_player(p_secret);
  select * into i from gch_items where id = p_item and owner_id = p.id for update;
  if not found then raise exception 'gch:bad_item'; end if;
  insert into gch_reports(item_id, player_id) values (i.id, p.id) on conflict do nothing;
  select count(*) into n from gch_reports where item_id = i.id;
  update gch_items set owner_id = null, pending = false, in_pool = (n < 3), hidden = (n >= 3) where id = i.id;
  if i.pending then update gch_players set pulls = greatest(0, pulls - 1) where id = p.id and pulls_day = t; end if;
  select * into p from gch_players where id = p.id;
  return gch_me_json(p);
end $$;

create or replace function gch_album(p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; r jsonb;
begin
  p := gch_player(p_secret);
  select coalesce(jsonb_agg(d.j order by d.created desc), '[]'::jsonb) into r from (
    select * from (
      select distinct on (i.id) gch_item_json(i, p.id) as j, e.created_at as created
      from gch_events e join gch_items i on i.id = e.item_id
      where e.taker_id = p.id and not i.hidden
      order by i.id, e.created_at desc) x
    order by created desc limit 300) d;
  return r;
end $$;

create or replace function gch_find(p_secret uuid, p_q text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
  from (select id, name from gch_players
        where name ilike replace(replace(btrim(p_q), '%', ''), '_', '') || '%' and secret <> p_secret
        order by name limit 8) x $$;

create or replace function gch_gift(p_secret uuid, p_item uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; q gch_players; i gch_items; t date := gch_today(); s int; cnt int;
begin
  p := gch_player(p_secret);
  select * into q from gch_players where id = p_to;
  if not found or q.id = p.id then raise exception 'gch:no_target'; end if;
  select * into i from gch_items where id = p_item and owner_id = p.id and not pending for update;
  if not found then raise exception 'gch:bad_item'; end if;
  s := case when q.last_day >= t - 1 then q.streak else 0 end;
  select count(*) into cnt from gch_items where owner_id = q.id and not pending;
  if cnt >= 20 + s / 7 then raise exception 'gch:full_target'; end if;
  update gch_items set owner_id = q.id where id = i.id;
  insert into gch_events(recipient_id, taker_id, kind, actor_name, item_id, item_name)
    values (q.id, q.id, 'gift', p.name, i.id, i.name);
  return gch_me_json(p);
end $$;

-- galería: só o que cada autor marca como público (en "Só os meus" ves todo o teu)
create or replace function gch_gallery(p_secret uuid, p_sort text default 'new', p_mine boolean default false, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; r jsonb; w date := gch_week();
begin
  perform gch_settle();
  p := gch_player(p_secret);
  select coalesce(jsonb_agg(x.j order by x.rn), '[]'::jsonb) into r from (
    select gch_item_json(i, p.id) || jsonb_build_object('owner', o.name, 'in_pool', i.in_pool,
             'likes', coalesce(vs.l, 0), 'dislikes', coalesce(vs.d, 0), 'my_vote', mv.vote) as j,
           row_number() over (order by
             case when p_sort = 'price' then i.value end desc nulls last,
             case when p_sort = 'top' then coalesce(vs.l, 0) - coalesce(vs.d, 0) end desc nulls last,
             i.created_at desc) as rn
    from gch_items i
    left join gch_players o on o.id = i.owner_id and not i.pending
    left join lateral (select count(*) filter (where vote = 1) as l, count(*) filter (where vote = -1) as d
                       from gch_votes where item_id = i.id and week = w) vs on true
    left join gch_votes mv on mv.item_id = i.id and mv.player_id = p.id and mv.week = w
    where not i.hidden and (case when p_mine then i.author_id = p.id else i.public end)
    order by rn offset greatest(0, p_offset) limit 60) x;
  return r;
end $$;

create or replace function gch_set_public(p_secret uuid, p_item uuid, p_public boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players;
begin
  p := gch_player(p_secret);
  update gch_items set public = p_public where id = p_item and author_id = p.id and not hidden;
  if not found then raise exception 'gch:bad_item'; end if;
  return jsonb_build_object('public', p_public);
end $$;

-- votar (1 = corazón, -1 = polgar abaixo, 0 = quitar o voto); non se votan os propios
create or replace function gch_vote(p_secret uuid, p_item uuid, p_vote int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; w date := gch_week(); l int; d int;
begin
  p := gch_player(p_secret);
  if not exists (select 1 from gch_items where id = p_item and public and not hidden and author_id <> p.id) then
    raise exception 'gch:bad_item'; end if;
  if p_vote = 0 then delete from gch_votes where item_id = p_item and player_id = p.id and week = w;
  elsif p_vote in (1, -1) then
    insert into gch_votes(item_id, player_id, week, vote) values (p_item, p.id, w, p_vote)
    on conflict (item_id, player_id, week) do update set vote = excluded.vote;
  else raise exception 'gch:bad_item'; end if;
  select count(*) filter (where vote = 1), count(*) filter (where vote = -1) into l, d
    from gch_votes where item_id = p_item and week = w;
  return jsonb_build_object('likes', l, 'dislikes', d, 'my_vote', nullif(p_vote, 0));
end $$;

-- código curto de xogador (9 letras/números sen confusións: sen 0/O, 1/I/L)
alter table gch_players add column if not exists code text;
create unique index if not exists gch_players_code_idx on gch_players(code);
create or replace function gch_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare a text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; b bytea;
begin
  loop
    b := uuid_send(gen_random_uuid()); c := '';
    for k in 0..8 loop c := c || substr(a, (get_byte(b, k) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from gch_players where code = c);
  end loop;
  return c;
end $$;
update gch_players set code = gch_new_code() where code is null;

-- recuperar a partida noutro dispositivo co código curto
create or replace function gch_recover(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p gch_players; c text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  select * into p from gch_players where code = c;
  if not found then raise exception 'gch:bad_code'; end if;
  return jsonb_build_object('secret', p.secret, 'me', gch_me_json(p));
end $$;

-- ranking público para mostrar fóra do xogo (ranking.html): non precisa código de xogador
-- p_view: 'ricos' (inventarios máis caros), 'pobres' (máis baratos), 'obras' (debuxos máis votados da galería)
-- p_period (só para 'obras'): 'semana' (votos desta semana, hora de España) ou 'sempre'
create or replace function gch_ranking_public(p_view text default 'ricos', p_period text default 'semana', p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := least(greatest(coalesce(p_limit, 10), 1), 100); w date := gch_week(); st gch_state; r jsonb;
begin
  select * into st from gch_state where id = 1;
  if p_view = 'obras' then
    select coalesce(jsonb_agg(s.j order by s.rn), '[]'::jsonb) into r from (
      select jsonb_build_object('name', i.name, 'author', i.author_name, 'value', i.value, 'img', i.img,
               'likes', v.l, 'dislikes', v.d) as j,
             row_number() over (order by v.l - v.d desc, v.l desc, i.value desc) as rn
      from (select item_id, count(*) filter (where vote = 1) as l, count(*) filter (where vote = -1) as d
            from gch_votes where p_period = 'sempre' or week = w group by item_id) v
      join gch_items i on i.id = v.item_id
      where i.public and not i.hidden
      order by rn limit n) s;
  else
    select coalesce(jsonb_agg(s.j order by s.rn), '[]'::jsonb) into r from (
      select jsonb_build_object('name', x.name, 'count', x.cnt, 'total', x.total) as j,
             row_number() over (order by
               case when p_view = 'pobres' then x.total end asc,
               case when p_view <> 'pobres' then x.total end desc,
               x.cnt desc) as rn
      from (select pl.name, count(i.id)::int as cnt, coalesce(sum(i.value), 0)::int as total
            from gch_players pl join gch_items i on i.owner_id = pl.id and not i.pending
            group by pl.id) x
      order by rn limit n) s;
  end if;
  return jsonb_build_object('started', st.started, 'goal', st.goal,
    'pool', (select count(*) from gch_items where in_pool), 'rows', r);
end $$;

-- ------------------------- permisos -------------------------
revoke execute on function gch_player(uuid), gch_item_json(gch_items, uuid), gch_me_json(gch_players), gch_settle(), gch_new_code()
  from public, anon, authenticated;
revoke execute on function gch_join(text), gch_me(uuid), gch_rename(uuid, text), gch_pool(),
  gch_submit(uuid, jsonb), gch_pull(uuid), gch_keep(uuid, uuid), gch_release(uuid, uuid), gch_ranking(uuid),
  gch_seen(uuid), gch_react(uuid, uuid, text), gch_report(uuid, uuid), gch_album(uuid), gch_find(uuid, text), gch_gift(uuid, uuid, uuid),
  gch_gallery(uuid, text, boolean, int), gch_set_public(uuid, uuid, boolean), gch_vote(uuid, uuid, int), gch_recover(text),
  gch_ranking_public(text, text, int)
  from public;
grant execute on function gch_join(text), gch_me(uuid), gch_rename(uuid, text), gch_pool(),
  gch_submit(uuid, jsonb), gch_pull(uuid), gch_keep(uuid, uuid), gch_release(uuid, uuid), gch_ranking(uuid),
  gch_seen(uuid), gch_react(uuid, uuid, text), gch_report(uuid, uuid), gch_album(uuid), gch_find(uuid, text), gch_gift(uuid, uuid, uuid),
  gch_gallery(uuid, text, boolean, int), gch_set_public(uuid, uuid, boolean), gch_vote(uuid, uuid, int), gch_recover(text),
  gch_ranking_public(text, text, int)
  to anon, authenticated;
