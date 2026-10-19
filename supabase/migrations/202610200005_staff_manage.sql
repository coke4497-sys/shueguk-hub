-- 강사 관리 (2026-10-19 원장님 "강사 관리 — 1. 근무시간·장소 2. 수업시간 3. 업무 진행상황 4. 티쳐스 페이지 사용시간 5. 슈톡 사용시간"
-- → 보는 사람 = 원장님 + 대표님, 사용 시간 = 화면을 보고 있는 시간만)
-- 업무 진행(취소·넘기기·미루기 + 사유)은 슈톡 마이그레이션(messenger_cancel·messenger_handover)의 msg_tasks 열을 그대로 읽으므로 여기서는 다루지 않는다.
--   teacher_usage : 사람·날짜(한국)·페이지마다 본 분 수 / usage_tick(p_page) : 화면이 1분마다 부른다(같은 묶음은 45초 안에 한 번만)
--   staff_usage(p_from, p_to) : 강사 관리 화면용 — 관리자·대표님만
-- 다른 마이그레이션과 순서 상관없음(teacher_accounts·private.msg_me 만 씀). 다시 실행해도 안전하다.

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

comment on table public.teacher_usage is '교사 화면 사용 시간 — 사람·날짜·페이지마다 본 분 수 (usage_tick)';
