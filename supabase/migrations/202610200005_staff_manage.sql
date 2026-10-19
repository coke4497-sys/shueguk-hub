-- 강사 관리 (2026-10-19 원장님 "강사 관리 — 1. 근무시간·장소 2. 수업시간 3. 업무 진행상황(완료·진행중·미룸·위임·삭제·사유)
-- 4. 티쳐스 페이지 사용시간 5. 슈톡 사용시간" → 보는 사람 = 원장님 + 대표님, 업무 = 상태 버튼 + 사유, 사용시간 = 화면을 보고 있는 시간만)
--   msg_tasks 상태 확장 : 대기 · 진행중 · 미룸 · 완료 · 위임 · 삭제 (앞 셋 = 남은 일, 뒤 셋 = 끝난 일)
--     state_reason·state_by_name·state_at : 마지막으로 상태를 바꾼 사유·사람·때 (미룸·위임·삭제는 사유 필수)
--     delegated_to·delegated_name : 위임한 할 일이 넘어간 사람 / delegated_from : 위임으로 새로 생긴 할 일의 원래 줄
--   msg_task_log : 상태를 바꿀 때마다 한 줄 (강사 관리 화면의 업무 기록)
--   msg_task_state(p_id, p_status, p_reason, p_to) : 상태 바꾸기 — 맡은 사람·맡긴 사람·관리자, @모두 할 일은 맡은 사람의 완료만
--   teacher_usage : 사람·날짜(한국)·페이지마다 본 분 수 / usage_tick(p_page) : 화면이 1분마다 부른다(같은 묶음은 45초 안에 한 번만)
--   staff_usage(p_from, p_to) : 강사 관리 화면용 — 관리자·대표님(STAFF 보는 사람)만
-- 202610190006·202610200004(조교 근무 일지) 다음에 적용한다. 다시 실행해도 안전하다.

-- ── 1. 할 일 상태 ─────────────────────────────────────
alter table public.msg_tasks drop constraint if exists msg_tasks_status_check;
alter table public.msg_tasks add constraint msg_tasks_status_check
  check (status in ('대기', '진행중', '미룸', '완료', '위임', '삭제'));
alter table public.msg_tasks add column if not exists state_reason text check (state_reason is null or length(state_reason) <= 300);
alter table public.msg_tasks add column if not exists state_by_name text;
alter table public.msg_tasks add column if not exists state_at timestamptz;
alter table public.msg_tasks add column if not exists delegated_to uuid references auth.users(id) on delete set null;
alter table public.msg_tasks add column if not exists delegated_name text;
alter table public.msg_tasks add column if not exists delegated_from bigint references public.msg_tasks(id) on delete set null;

create table if not exists public.msg_task_log (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.msg_tasks(id) on delete cascade,
  status text not null,
  reason text,
  to_name text,
  by_user uuid references auth.users(id) on delete set null,
  by_name text not null default '',
  at timestamptz not null default now()
);
create index if not exists msg_task_log_task on public.msg_task_log (task_id);
create index if not exists msg_task_log_at on public.msg_task_log (at);
alter table public.msg_task_log enable row level security;
revoke all on table public.msg_task_log from anon, authenticated;
grant select on table public.msg_task_log to authenticated;
drop policy if exists msg_task_log_read on public.msg_task_log;
create policy msg_task_log_read on public.msg_task_log
  for select to authenticated using ((select private.is_active_teacher()));

create or replace function public.msg_task_state(p_id bigint, p_status text, p_reason text default null, p_to uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
  v_st text := btrim(coalesce(p_status, ''));
  v_rs text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to public.teacher_accounts;
  v_new public.msg_tasks;
  v_closed boolean;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if v_st not in ('대기', '진행중', '미룸', '완료', '위임', '삭제') then
    raise exception 'bad_status';
  end if;
  if v_st in ('미룸', '위임', '삭제') and v_rs is null then
    raise exception 'need_reason';
  end if;
  if length(coalesce(v_rs, '')) > 300 then
    raise exception 'too_long';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  if v_t.assignee is distinct from v_me.user_id
     and v_t.requester is distinct from v_me.user_id
     and v_me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- @모두 할 일은 맡은 사람의 완료(=확인)만
  if v_t.ack_only and (v_t.assignee is distinct from v_me.user_id or v_st <> '완료') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- 이미 넘긴 할 일은 되돌리지 않는다(넘겨받은 쪽 줄과 둘이 되지 않게)
  if v_t.status = '위임' then
    raise exception 'delegated';
  end if;
  if v_st = '위임' then
    select * into v_to from public.teacher_accounts where user_id = p_to and active;
    if v_to.user_id is null then
      raise exception 'bad_to';
    end if;
    if v_to.user_id = v_t.assignee then
      raise exception 'same_person';
    end if;
  end if;

  v_closed := v_st in ('완료', '위임', '삭제');
  update public.msg_tasks set
    status = v_st,
    state_reason = v_rs,
    state_by_name = v_me.display_name,
    state_at = now(),
    done_by_name = case when v_closed then v_me.display_name else null end,
    done_at = case when v_closed then coalesce(case when v_t.status = v_st then v_t.done_at end, now()) else null end,
    seen_at = case when v_st = '완료' and v_t.assignee = v_me.user_id then coalesce(v_t.seen_at, now()) else v_t.seen_at end,
    delegated_to = case when v_st = '위임' then v_to.user_id else null end,
    delegated_name = case when v_st = '위임' then v_to.display_name else null end,
    updated_at = now()
  where id = p_id
  returning * into v_t;

  insert into public.msg_task_log (task_id, status, reason, to_name, by_user, by_name)
  values (v_t.id, v_st, v_rs, v_to.display_name, v_me.user_id, v_me.display_name);

  if v_st = '위임' then
    insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, delegated_from)
    values (v_t.message_id, v_to.user_id, v_to.display_name, v_t.requester, v_t.requester_name, v_t.text, v_t.id)
    returning * into v_new;
  end if;

  return jsonb_build_object('task', to_jsonb(v_t), 'new', case when v_new.id is null then null else to_jsonb(v_new) end);
end;
$$;

-- 옛 체크(완료/대기) — 위임한 할 일은 바꾸지 못하게, 기록도 남긴다. 나머지는 202610190005와 같다.
create or replace function public.msg_task_set(p_id bigint, p_done boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  if v_t.assignee is distinct from v_me.user_id
     and v_t.requester is distinct from v_me.user_id
     and v_me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_t.ack_only and v_t.assignee is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_t.ack_only and not p_done then
    raise exception 'ack_locked';
  end if;
  if v_t.status = '위임' then
    raise exception 'delegated';
  end if;
  update public.msg_tasks set
    status = case when p_done then '완료' else '대기' end,
    done_by_name = case when p_done then v_me.display_name else null end,
    done_at = case when p_done then coalesce(case when v_t.status = '완료' then v_t.done_at end, now()) else null end,
    seen_at = case when p_done and v_t.assignee = v_me.user_id then coalesce(v_t.seen_at, now()) else v_t.seen_at end,
    state_reason = null,
    state_by_name = v_me.display_name,
    state_at = now(),
    updated_at = now()
  where id = p_id
  returning * into v_t;
  insert into public.msg_task_log (task_id, status, by_user, by_name)
  values (v_t.id, v_t.status, v_me.user_id, v_me.display_name);
  return to_jsonb(v_t);
end;
$$;

revoke all on function public.msg_task_state(bigint, text, text, uuid) from public, anon;
revoke all on function public.msg_task_set(bigint, boolean) from public, anon;
grant execute on function public.msg_task_state(bigint, text, text, uuid) to authenticated;
grant execute on function public.msg_task_set(bigint, boolean) to authenticated;

-- ── 2. 사용 시간 ─────────────────────────────────────
create table if not exists public.teacher_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  ymd date not null,
  page text not null check (length(page) between 1 and 80),
  name text not null default '',
  minutes integer not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, ymd, page)
);
create index if not exists teacher_usage_ymd on public.teacher_usage (ymd);
-- 묶음(슈톡/티쳐스)마다 마지막으로 센 때 — 창 여러 개를 함께 띄워도 1분에 한 번만 센다
create table if not exists public.teacher_usage_last (
  user_id uuid not null references auth.users(id) on delete cascade,
  grp text not null,
  at timestamptz not null,
  primary key (user_id, grp)
);
alter table public.teacher_usage enable row level security;
alter table public.teacher_usage_last enable row level security;
revoke all on table public.teacher_usage, public.teacher_usage_last from anon, authenticated;   -- 표는 직접 못 읽는다(함수로만)

create or replace function public.usage_tick(p_page text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_page text := lower(btrim(coalesce(p_page, '')));
  v_grp text;
  v_last timestamptz;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_me.user_id is null then
    return false;
  end if;
  if v_page !~ '^[a-z0-9._-]{1,40}/[a-z0-9._-]{1,38}$' then
    raise exception 'bad_page';
  end if;
  v_grp := case when v_page = 'shueguk-hub/messenger.html' then 'shuetalk' else 'teachers' end;
  select at into v_last from public.teacher_usage_last where user_id = v_me.user_id and grp = v_grp for update;
  if v_last is not null and now() - v_last < interval '45 seconds' then
    return false;
  end if;
  insert into public.teacher_usage_last (user_id, grp, at) values (v_me.user_id, v_grp, now())
  on conflict (user_id, grp) do update set at = excluded.at;
  insert into public.teacher_usage (user_id, ymd, page, name, minutes)
  values (v_me.user_id, v_day, v_page, v_me.display_name, 1)
  on conflict (user_id, ymd, page) do update set
    minutes = public.teacher_usage.minutes + 1, name = excluded.name, last_at = now();
  return true;
end;
$$;

-- 강사 관리를 볼 수 있는 사람 — 관리자(원장님) + 대표님(박언호 parkeh). 화면의 STAFF_VIEWERS와 같은 목록.
create or replace function private.staff_viewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_accounts t
    where t.user_id = (select auth.uid()) and t.active
      and (t.role = 'admin' or t.login_id = any (array['parkeh']))
  );
$$;
revoke all on function private.staff_viewer() from public;

create or replace function public.staff_usage(p_from date, p_to date)
returns table (user_id uuid, name text, ymd date, page text, minutes integer, first_at timestamptz, last_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.staff_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'bad_range';
  end if;
  return query
    select u.user_id, u.name, u.ymd, u.page, u.minutes, u.first_at, u.last_at
    from public.teacher_usage u
    where u.ymd between p_from and p_to
    order by u.ymd, u.name, u.page;
end;
$$;

revoke all on function public.usage_tick(text) from public, anon;
revoke all on function public.staff_usage(date, date) from public, anon;
grant execute on function public.usage_tick(text) to authenticated;
grant execute on function public.staff_usage(date, date) to authenticated;

comment on table public.msg_task_log is '슈톡 할 일 상태 기록 — 바꿀 때마다 한 줄 (강사 관리)';
comment on table public.teacher_usage is '교사 화면 사용 시간 — 사람·날짜·페이지마다 본 분 수 (usage_tick)';
