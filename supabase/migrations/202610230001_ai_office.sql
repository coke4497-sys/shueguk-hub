-- 슈국 AI 교무실 (2026-10-23 원장님 "이런 걸 만들고 싶어요" → 자리 = 슈국 운영 메뉴 · 실행 = 클라우드 예약 순찰 ·
-- 조교 = 교재·검수·홍보·행정 · 화면 = 픽셀 교무실 + 업무판). 먼더 디플린(PC 앱)은 교재 작업에 따로 쓴다.
--   ai_orders : 원장님·대표님의 지시 한 줄 (접수 → 진행 → 완료 / 취소)
--   ai_tasks  : 팀장(클로드 순찰)이 지시를 나눈 할 일 — 단계(기획·조사·초안·검수·확인)와 칸(진행·검수·확인·완료·중단)
--   ai_meta   : 마지막 순찰 시각 등
-- 보는 사람·쓰는 사람 = private.staff_viewer()(관리자 + 대표님 parkeh — 강사 관리와 같은 목록).
-- 화면은 ai_order_add·ai_order_cancel·ai_task_decide·ai_task_stop 으로만 쓴다.
-- 클로드 순찰은 엣지 함수 ai-office(service_role)로 ai_bot_claim·ai_bot_task·ai_bot_release 를 부른다 — 완료로는 못 옮긴다(원장님 확인만).
-- 202610200005_staff_manage(private.staff_viewer)·202610190001_messenger(private.msg_me) 뒤에 돌린다. 다시 실행해도 안전하다.

create table if not exists public.ai_orders (
  id bigserial primary key,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  to_role text not null default 'lead' check (to_role in ('lead', 'gyo', 'gum', 'hong', 'haeng')),
  author uuid,
  author_name text not null default '',
  status text not null default '접수' check (status in ('접수', '진행', '완료', '취소')),
  picked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_orders_status on public.ai_orders (status, id);

create table if not exists public.ai_tasks (
  id bigserial primary key,
  order_id bigint not null references public.ai_orders(id) on delete cascade,
  role text not null check (role in ('lead', 'gyo', 'gum', 'hong', 'haeng')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  col text not null default '진행' check (col in ('진행', '검수', '확인', '완료', '중단')),
  stage smallint not null default 0 check (stage between 0 and 5),
  last text not null default '' check (char_length(last) <= 500),
  result text not null default '' check (char_length(result) <= 30000),
  result_url text not null default '' check (char_length(result_url) <= 500),
  log jsonb not null default '[]'::jsonb,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_tasks_order on public.ai_tasks (order_id);
create index if not exists ai_tasks_col on public.ai_tasks (col, updated_at);

create table if not exists public.ai_meta (
  key text primary key,
  at timestamptz,
  note text not null default ''
);

-- 읽기 규칙용 — 표 규칙은 교사 신분으로 돌므로 실행 권한을 준다(근무 일지 work_viewer 와 같은 방식)
create or replace function private.ai_viewer()
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.staff_viewer() $$;
revoke all on function private.ai_viewer() from public;
grant execute on function private.ai_viewer() to authenticated;

alter table public.ai_orders enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_meta enable row level security;
revoke all on table public.ai_orders, public.ai_tasks, public.ai_meta from anon, authenticated;
grant select on table public.ai_orders, public.ai_tasks, public.ai_meta to authenticated;
drop policy if exists ai_orders_read on public.ai_orders;
drop policy if exists ai_tasks_read on public.ai_tasks;
drop policy if exists ai_meta_read on public.ai_meta;
create policy ai_orders_read on public.ai_orders for select to authenticated using ((select private.ai_viewer()));
create policy ai_tasks_read on public.ai_tasks for select to authenticated using ((select private.ai_viewer()));
create policy ai_meta_read on public.ai_meta for select to authenticated using ((select private.ai_viewer()));

-- 기록 한 줄 덧붙이기 (최근 40개만 남긴다)
create or replace function private.ai_log(p_log jsonb, p_who text, p_text text)
returns jsonb
language sql immutable set search_path = ''
as $$
  select case when coalesce(btrim(p_text), '') = '' then coalesce(p_log, '[]'::jsonb) else
    (select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from (
      select e, n from jsonb_array_elements(coalesce(p_log, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('at', to_char(now() at time zone 'Asia/Seoul', 'MM/DD HH24:MI'), 'who', coalesce(p_who, ''), 'text', left(btrim(p_text), 300))
      )) with ordinality as t(e, n)
      order by n desc limit 40) s)
  end
$$;
revoke all on function private.ai_log(jsonb, text, text) from public;

create or replace function private.ai_role_name(p_role text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_role when 'gyo' then '교재 조교' when 'gum' then '검수 조교' when 'hong' then '홍보 조교'
    when 'haeng' then '행정 조교' else '팀장 슈콩' end
$$;
revoke all on function private.ai_role_name(text) from public;

-- ── 화면(원장님·대표님) ───────────────────────────────
create or replace function public.ai_order_add(p_body text, p_role text default 'lead')
returns public.ai_orders
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.ai_orders;
begin
  if not private.staff_viewer() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'empty'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'too_long'; end if;
  if coalesce(p_role, 'lead') not in ('lead', 'gyo', 'gum', 'hong', 'haeng') then raise exception 'bad_role'; end if;
  insert into public.ai_orders (body, to_role, author, author_name)
  values (btrim(p_body), coalesce(p_role, 'lead'), v_me.user_id, coalesce(v_me.display_name, ''))
  returning * into v_row;
  return v_row;
end;
$$;

-- 아직 클로드가 가져가지 않은 지시만 취소한다
create or replace function public.ai_order_cancel(p_id bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.staff_viewer() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.ai_orders set status = '취소', updated_at = now()
  where id = p_id and status = '접수' and picked_at is null;
  if not found then raise exception 'not_open'; end if;
  return true;
end;
$$;

-- 원장님 확인 칸의 할 일: 승인(완료) 또는 다시 고쳐 줘(의견 필수 → 진행 칸으로, 다음 순찰이 이어서)
create or replace function public.ai_task_decide(p_id bigint, p_ok boolean, p_note text default '')
returns public.ai_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.ai_tasks;
  v_note text := left(btrim(coalesce(p_note, '')), 300);
begin
  if not private.staff_viewer() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_t from public.ai_tasks where id = p_id for update;
  if v_t.id is null then raise exception 'not_found'; end if;
  if v_t.col <> '확인' then raise exception 'not_waiting'; end if;
  if not coalesce(p_ok, false) and v_note = '' then raise exception 'need_note'; end if;
  if coalesce(p_ok, false) then
    update public.ai_tasks set col = '완료', stage = 5, last = case when v_note = '' then '원장님 승인' else '원장님 승인 · ' || v_note end,
      decided_by_name = v_me.display_name, decided_at = now(), updated_at = now(),
      log = private.ai_log(log, v_me.display_name, '승인' || case when v_note = '' then '' else ' — ' || v_note end)
    where id = p_id returning * into v_t;
    update public.ai_orders o set status = '완료', picked_at = null, updated_at = now()
    where o.id = v_t.order_id and o.status = '진행'
      and not exists (select 1 from public.ai_tasks t where t.order_id = o.id and t.col not in ('완료', '중단'));
  else
    update public.ai_tasks set col = '진행', stage = least(stage, 2), last = '원장님 의견: ' || v_note,
      decided_by_name = v_me.display_name, decided_at = now(), updated_at = now(),
      log = private.ai_log(log, v_me.display_name, '다시 고쳐 줘 — ' || v_note)
    where id = p_id returning * into v_t;
    update public.ai_orders set status = '진행', picked_at = null, updated_at = now() where id = v_t.order_id;
  end if;
  return v_t;
end;
$$;

-- 더 하지 않아도 되는 할 일을 그만둔다(완료가 아닌 것만)
create or replace function public.ai_task_stop(p_id bigint, p_note text default '')
returns public.ai_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.ai_tasks;
  v_note text := left(btrim(coalesce(p_note, '')), 300);
begin
  if not private.staff_viewer() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.ai_tasks set col = '중단', last = case when v_note = '' then '원장님이 그만두게 함' else '그만둠 · ' || v_note end,
    decided_by_name = v_me.display_name, decided_at = now(), updated_at = now(),
    log = private.ai_log(log, v_me.display_name, '그만둠' || case when v_note = '' then '' else ' — ' || v_note end)
  where id = p_id and col not in ('완료', '중단') returning * into v_t;
  if v_t.id is null then raise exception 'not_open'; end if;
  update public.ai_orders o set status = '완료', picked_at = null, updated_at = now()
  where o.id = v_t.order_id and o.status = '진행'
    and not exists (select 1 from public.ai_tasks t where t.order_id = o.id and t.col not in ('완료', '중단'));
  return v_t;
end;
$$;

revoke all on function public.ai_order_add(text, text) from public, anon;
revoke all on function public.ai_order_cancel(bigint) from public, anon;
revoke all on function public.ai_task_decide(bigint, boolean, text) from public, anon;
revoke all on function public.ai_task_stop(bigint, text) from public, anon;
grant execute on function public.ai_order_add(text, text) to authenticated;
grant execute on function public.ai_order_cancel(bigint) to authenticated;
grant execute on function public.ai_task_decide(bigint, boolean, text) to authenticated;
grant execute on function public.ai_task_stop(bigint, text) to authenticated;

-- ── 클로드 순찰(service_role 만) ─────────────────────────
-- 지시를 가져간다 — 순찰이 겹쳐도 한쪽만. 50분 넘게 끝내지 못한 순찰의 지시는 다시 가져갈 수 있다.
create or replace function public.ai_bot_claim(p_order bigint)
returns public.ai_orders
language plpgsql security definer set search_path = ''
as $$
declare v_o public.ai_orders;
begin
  update public.ai_orders set status = '진행', picked_at = now(), updated_at = now()
  where id = p_order and status in ('접수', '진행')
    and (picked_at is null or picked_at < now() - interval '50 minutes')
  returning * into v_o;
  return v_o;   -- 못 가져가면 빈 줄(id null)
end;
$$;

-- 할 일 만들기(p_id null) 또는 고치기. 칸은 진행·검수·확인만 — 완료는 원장님만 정한다. null 인자는 그대로 둔다.
create or replace function public.ai_bot_task(
  p_id bigint, p_order bigint, p_role text, p_title text, p_col text, p_stage integer,
  p_last text, p_result text, p_result_url text, p_log text)
returns public.ai_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_t public.ai_tasks;
  v_o public.ai_orders;
begin
  if p_col is not null and p_col not in ('진행', '검수', '확인') then raise exception 'bad_col'; end if;
  if p_stage is not null and (p_stage < 0 or p_stage > 4) then raise exception 'bad_stage'; end if;
  if p_role is not null and p_role not in ('lead', 'gyo', 'gum', 'hong', 'haeng') then raise exception 'bad_role'; end if;
  if p_id is null then
    select * into v_o from public.ai_orders where id = p_order for update;
    if v_o.id is null then raise exception 'no_order'; end if;
    if v_o.status in ('취소', '완료') then raise exception 'order_closed'; end if;
    if coalesce(btrim(p_title), '') = '' then raise exception 'need_title'; end if;
    insert into public.ai_tasks (order_id, role, title, col, stage, last, result, result_url, log)
    values (p_order, coalesce(p_role, 'lead'), left(btrim(p_title), 200), coalesce(p_col, '진행'), coalesce(p_stage, 0),
      left(coalesce(p_last, ''), 500), coalesce(p_result, ''), left(coalesce(p_result_url, ''), 500),
      private.ai_log('[]'::jsonb, '팀장 슈콩', private.ai_role_name(coalesce(p_role, 'lead')) || '에게 맡김'))
    returning * into v_t;
    if coalesce(btrim(p_log), '') <> '' then
      update public.ai_tasks set log = private.ai_log(log, private.ai_role_name(role), p_log) where id = v_t.id returning * into v_t;
    end if;
    update public.ai_orders set status = '진행', updated_at = now() where id = p_order and status = '접수';
    return v_t;
  end if;
  select * into v_t from public.ai_tasks where id = p_id for update;
  if v_t.id is null then raise exception 'not_found'; end if;
  if v_t.col in ('완료', '중단') then raise exception 'closed'; end if;
  update public.ai_tasks set
    role = coalesce(p_role, role),
    title = coalesce(nullif(left(btrim(p_title), 200), ''), title),
    col = coalesce(p_col, col),
    stage = coalesce(p_stage, stage),
    last = coalesce(left(p_last, 500), last),
    result = coalesce(p_result, result),
    result_url = coalesce(left(p_result_url, 500), result_url),
    log = private.ai_log(log, private.ai_role_name(coalesce(p_role, role)), p_log),
    updated_at = now()
  where id = p_id returning * into v_t;
  return v_t;
end;
$$;

-- 순찰을 마칠 때 — 가져간 표시를 풀고 마지막 순찰 시각을 적는다
create or replace function public.ai_bot_release(p_order bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_order is not null then
    update public.ai_orders set picked_at = null, updated_at = now() where id = p_order;
  end if;
  insert into public.ai_meta (key, at) values ('patrol', now())
  on conflict (key) do update set at = excluded.at;
  return true;
end;
$$;

revoke all on function public.ai_bot_claim(bigint) from public, anon, authenticated;
revoke all on function public.ai_bot_task(bigint, bigint, text, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ai_bot_release(bigint) from public, anon, authenticated;
grant execute on function public.ai_bot_claim(bigint) to service_role;
grant execute on function public.ai_bot_task(bigint, bigint, text, text, text, integer, text, text, text, text) to service_role;
grant execute on function public.ai_bot_release(bigint) to service_role;
grant select, insert, update on table public.ai_orders, public.ai_tasks, public.ai_meta to service_role;
grant usage on all sequences in schema public to service_role;

comment on table public.ai_orders is 'AI 교무실 지시 — 원장님·대표님이 남기고 클로드 순찰이 가져간다';
comment on table public.ai_tasks is 'AI 교무실 할 일 — 팀장이 나눈 일, 완료는 원장님 확인으로만';
