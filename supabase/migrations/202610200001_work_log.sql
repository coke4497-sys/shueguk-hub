-- 조교 근무 일지 (2026-10-20 원장님 — 시트 「★자습감독 근무일지」를 대신한다. 11월부터 새로 시작, 당분간 시트와 함께 쓴다)
--   work_staff   : 근무 일지에 드는 사람 + 시급. 시급은 본인과 원장님(admin)·박언호 대표님(parkeh)만 읽는다.
--   work_roster  : 기본 근무표 — 요일(1=월 … 7=일) × 센터 × 자리(본원처럼 두 명이 함께 근무하면 자리 1·2)
--   work_shifts  : 날짜별 근무표 — 기본 근무표에서 만들고, 근무자 교체는 이 줄을 바꾼다(원래 근무자·사유·바꾼 사람이 남는다)
--   work_records : 실제 근무 기록 — 슈톡 [출근]·[퇴근](msg_presence_set)이 자동으로 쓴다
-- 근무 시간 규칙(원장님): 근무표 시작 시각보다 일찍 [출근]을 눌러도 근무 시간은 시작 시각부터 센다(start_at).
-- 쓰기는 함수로만, 읽기는 활성 교사만. 202610190004(출근·퇴근) 다음에 적용한다. 다시 실행해도 안전하다.

create table if not exists public.work_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wage integer not null default 0 check (wage between 0 and 1000000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_roster (
  id bigint generated always as identity primary key,
  dow smallint not null check (dow between 1 and 7),
  loc text not null check (loc in ('본원', '화정센터', '민초센터', '정리정독')),
  slot smallint not null default 1 check (slot between 1 and 4),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_hm text not null check (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_hm text not null check (end_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text not null default '' check (length(note) <= 60),
  unique (dow, loc, slot)
);

create table if not exists public.work_shifts (
  id bigint generated always as identity primary key,
  ymd date not null,
  loc text not null check (loc in ('본원', '화정센터', '민초센터', '정리정독')),
  slot smallint not null default 1 check (slot between 1 and 4),
  user_id uuid references auth.users(id) on delete set null,   -- null = 이 날 근무 없음
  start_hm text not null,
  end_hm text not null,
  note text not null default '',
  orig_user_id uuid references auth.users(id) on delete set null,  -- 교체 전 근무자(교체 안 했으면 null)
  swap_reason text not null default '',
  swapped_by_name text not null default '',
  swapped_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (ymd, loc, slot)
);
create index if not exists work_shifts_user on public.work_shifts (user_id, ymd);

create table if not exists public.work_records (
  id bigint generated always as identity primary key,
  ymd date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  loc text not null default '',
  in_at timestamptz not null,       -- [출근]을 누른 시각
  start_at timestamptz not null,    -- 근무 시간 시작(근무표 시작보다 이르면 시작 시각)
  out_at timestamptz,               -- [퇴근]을 누른 시각(없으면 아직 근무 중이거나 퇴근을 못 누름)
  fixed boolean not null default false,
  fix_reason text not null default '',
  fixed_by_name text not null default '',
  fixed_at timestamptz,
  orig_in_at timestamptz,
  orig_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_records_user on public.work_records (user_id, ymd);
create index if not exists work_records_ymd on public.work_records (ymd);

alter table public.work_staff enable row level security;
alter table public.work_roster enable row level security;
alter table public.work_shifts enable row level security;
alter table public.work_records enable row level security;
revoke all on table public.work_staff, public.work_roster, public.work_shifts, public.work_records from anon, authenticated;
grant select on table public.work_staff, public.work_roster, public.work_shifts, public.work_records to authenticated;

-- 급여를 볼 수 있는 사람: 원장님(admin)과 박언호 대표님(parkeh) — 27 예상 시간표의 P27_VIEWERS와 같은 사람
create or replace function private.work_viewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_accounts t
    where t.user_id = (select auth.uid()) and t.active
      and (t.role = 'admin' or t.login_id in ('parkeh'))
  );
$$;
revoke all on function private.work_viewer() from public;
grant execute on function private.work_viewer() to authenticated;

create or replace function private.work_today()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date $$;
revoke all on function private.work_today() from public;
grant execute on function private.work_today() to authenticated;

drop policy if exists work_staff_read on public.work_staff;
create policy work_staff_read on public.work_staff
  for select to authenticated using ((select private.is_active_teacher()) and (user_id = (select auth.uid()) or (select private.work_viewer())));
drop policy if exists work_roster_read on public.work_roster;
create policy work_roster_read on public.work_roster
  for select to authenticated using ((select private.is_active_teacher()));
drop policy if exists work_shifts_read on public.work_shifts;
create policy work_shifts_read on public.work_shifts
  for select to authenticated using ((select private.is_active_teacher()));
drop policy if exists work_records_read on public.work_records;
create policy work_records_read on public.work_records
  for select to authenticated using ((select private.is_active_teacher()));

-- 근무 일지 사람 목록(시급 없이) — 근무표 드롭다운·이름 표시용
create or replace function public.work_staff_list()
returns table (user_id uuid, name text, role text, active boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (private.msg_me()).user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  return query
    select s.user_id, t.display_name, t.role, (s.active and t.active)
    from public.work_staff s join public.teacher_accounts t on t.user_id = s.user_id
    order by t.display_name;
end;
$$;

-- 나는 누구인가: 급여를 볼 수 있는지, 근무 일지에 드는지
create or replace function public.work_me()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me public.teacher_accounts := private.msg_me();
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'viewer', private.work_viewer(),
    'staff', exists (select 1 from public.work_staff s where s.user_id = v_me.user_id and s.active),
    'today', private.work_today());
end;
$$;

-- 시급·근무 일지 포함 여부 (급여를 볼 수 있는 사람만)
create or replace function public.work_staff_set(p_user uuid, p_wage integer, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teacher_accounts t where t.user_id = p_user) then
    raise exception 'bad_user';
  end if;
  insert into public.work_staff (user_id, wage, active, updated_at)
  values (p_user, coalesce(p_wage, 0), coalesce(p_active, true), now())
  on conflict (user_id) do update set wage = excluded.wage, active = excluded.active, updated_at = now();
end;
$$;

-- 그 날짜의 근무표를 기본 근무표로 채운다(오늘·앞날만 — 지난 날은 그때 있던 그대로 둔다)
create or replace function private.work_fill(p_from date, p_to date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare d date;
begin
  for d in select generate_series(greatest(p_from, private.work_today()), least(p_to, private.work_today() + 90), interval '1 day')::date loop
    insert into public.work_shifts (ymd, loc, slot, user_id, start_hm, end_hm, note)
    select d, r.loc, r.slot, r.user_id, r.start_hm, r.end_hm, r.note
    from public.work_roster r
    where r.dow = extract(isodow from d)
    on conflict (ymd, loc, slot) do nothing;
  end loop;
end;
$$;
revoke all on function private.work_fill(date, date) from public;

create or replace function public.work_ensure(p_from date, p_to date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (private.msg_me()).user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'bad_range';
  end if;
  perform private.work_fill(p_from, p_to);
end;
$$;

-- 기본 근무표 바꾸기 (급여를 볼 수 있는 사람만) — p_from부터의 근무표를 새 기본 근무표로 다시 만든다(교체한 칸은 그대로)
-- p_rows: [{dow, loc, slot, user_id, start_hm, end_hm, note}]
create or replace function public.work_roster_save(p_rows jsonb, p_from date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_from < private.work_today() then
    raise exception 'bad_from';
  end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' then
    raise exception 'bad_rows';
  end if;
  delete from public.work_roster;
  insert into public.work_roster (dow, loc, slot, user_id, start_hm, end_hm, note)
  select (x->>'dow')::smallint, x->>'loc', coalesce((x->>'slot')::smallint, 1), (x->>'user_id')::uuid,
         x->>'start_hm', x->>'end_hm', coalesce(x->>'note', '')
  from jsonb_array_elements(p_rows) x
  where nullif(x->>'user_id', '') is not null;
  get diagnostics v_n = row_count;
  delete from public.work_shifts where ymd >= p_from and swapped_at is null;
  perform private.work_fill(p_from, p_from + 56);
  return v_n;
end;
$$;

-- 근무자 교체 (조교끼리 — 활성 교사면 누구나). p_user null = 이 날 근무 없음. 원래 근무자로 되돌리면 교체 기록을 지운다.
create or replace function public.work_swap(p_id bigint, p_user uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.work_shifts;
  v_orig uuid;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 100 then
    raise exception 'too_long';
  end if;
  select * into v_row from public.work_shifts where id = p_id for update;
  if v_row.id is null then
    raise exception 'not_found';
  end if;
  if p_user is not null and not exists (
    select 1 from public.work_staff s join public.teacher_accounts t on t.user_id = s.user_id
    where s.user_id = p_user and s.active and t.active) then
    raise exception 'bad_user';
  end if;
  v_orig := coalesce(v_row.orig_user_id, v_row.user_id);
  if p_user is not distinct from v_orig then
    update public.work_shifts set user_id = v_orig, orig_user_id = null, swap_reason = '',
      swapped_by_name = '', swapped_at = null, updated_at = now()
    where id = p_id returning * into v_row;
  else
    update public.work_shifts set user_id = p_user, orig_user_id = v_orig, swap_reason = btrim(coalesce(p_reason, '')),
      swapped_by_name = v_me.display_name, swapped_at = now(), updated_at = now()
    where id = p_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- 근무 시각 고치기 — 본인 기록은 본인이, 모든 기록은 급여를 볼 수 있는 사람이. p_id null = 출근을 못 눌러 기록이 없는 날 새로 넣기
-- p_in·p_out: 'HH:MM'(한국 시간). 근무표 시작보다 이른 출근은 시작 시각부터 센다(자동 기록과 같은 규칙).
create or replace function public.work_fix(p_id bigint, p_user uuid, p_ymd date, p_loc text, p_in text, p_out text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.work_records;
  v_user uuid;
  v_ymd date;
  v_in timestamptz;
  v_out timestamptz;
  v_start timestamptz;
  v_sched text;
  v_name text;
  v_loc text := btrim(coalesce(p_loc, ''));
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'need_reason';
  end if;
  if length(p_reason) > 100 then
    raise exception 'too_long';
  end if;
  if coalesce(p_in, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_out, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad_time';
  end if;
  if p_id is not null then
    select * into v_row from public.work_records where id = p_id for update;
    if v_row.id is null then
      raise exception 'not_found';
    end if;
    v_user := v_row.user_id; v_ymd := v_row.ymd;
    if v_loc = '' then v_loc := v_row.loc; end if;
  else
    v_user := p_user; v_ymd := p_ymd;
    if v_user is null or v_ymd is null then
      raise exception 'bad_args';
    end if;
    if not exists (select 1 from public.work_staff s where s.user_id = v_user) then
      raise exception 'bad_user';
    end if;
  end if;
  if v_user <> v_me.user_id and not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_ymd > private.work_today() then
    raise exception 'future';
  end if;
  if v_loc not in ('본원', '화정센터', '민초센터', '정리정독') then
    raise exception 'bad_loc';
  end if;
  v_in := (v_ymd + p_in::time) at time zone 'Asia/Seoul';
  v_out := (v_ymd + p_out::time) at time zone 'Asia/Seoul';
  if v_out <= v_in then
    raise exception 'bad_order';
  end if;
  select min(start_hm) into v_sched from public.work_shifts where ymd = v_ymd and user_id = v_user;
  v_start := v_in;
  if v_sched is not null and (v_ymd + v_sched::time) at time zone 'Asia/Seoul' > v_in then
    v_start := (v_ymd + v_sched::time) at time zone 'Asia/Seoul';
  end if;
  if v_out <= v_start then
    raise exception 'bad_order';
  end if;
  if v_row.id is not null then
    update public.work_records set loc = v_loc, in_at = v_in, start_at = v_start, out_at = v_out,
      orig_in_at = case when fixed then orig_in_at else in_at end,
      orig_out_at = case when fixed then orig_out_at else out_at end,
      fixed = true, fix_reason = btrim(p_reason), fixed_by_name = v_me.display_name, fixed_at = now(), updated_at = now()
    where id = v_row.id returning * into v_row;
  else
    select display_name into v_name from public.teacher_accounts where user_id = v_user;
    insert into public.work_records (ymd, user_id, name, loc, in_at, start_at, out_at, fixed, fix_reason, fixed_by_name, fixed_at)
    values (v_ymd, v_user, coalesce(v_name, ''), v_loc, v_in, v_start, v_out, true, btrim(p_reason), v_me.display_name, now())
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- 기록 지우기 (급여를 볼 수 있는 사람만 — 잘못 누른 출근 등)
create or replace function public.work_record_delete(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.work_records where id = p_id;
end;
$$;

revoke all on function public.work_staff_list() from public, anon;
revoke all on function public.work_me() from public, anon;
revoke all on function public.work_staff_set(uuid, integer, boolean) from public, anon;
revoke all on function public.work_ensure(date, date) from public, anon;
revoke all on function public.work_roster_save(jsonb, date) from public, anon;
revoke all on function public.work_swap(bigint, uuid, text) from public, anon;
revoke all on function public.work_fix(bigint, uuid, date, text, text, text, text) from public, anon;
revoke all on function public.work_record_delete(bigint) from public, anon;
grant execute on function public.work_staff_list() to authenticated;
grant execute on function public.work_me() to authenticated;
grant execute on function public.work_staff_set(uuid, integer, boolean) to authenticated;
grant execute on function public.work_ensure(date, date) to authenticated;
grant execute on function public.work_roster_save(jsonb, date) to authenticated;
grant execute on function public.work_swap(bigint, uuid, text) to authenticated;
grant execute on function public.work_fix(bigint, uuid, date, text, text, text, text) to authenticated;
grant execute on function public.work_record_delete(bigint) to authenticated;

-- 슈톡 출근·퇴근(202610190004)에 근무 기록을 더한다 — 본문은 그대로, 근무 일지에 드는 사람만 기록하고 결과에 work를 붙인다.
--   출근: 오늘 열린 기록이 없으면 새로 연다(센터만 바꾸는 출근은 이어 간다). 근무표 시작보다 이르면 시작 시각부터 센다 → work.clipped
--   퇴근: 오늘 열린 기록을 닫는다.
create or replace function public.msg_presence_set(p_loc text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_loc text := btrim(coalesce(p_loc, ''));
  v_row public.msg_presence;
  v_today date := private.work_today();
  v_rec public.work_records;
  v_sched text;
  v_start timestamptz;
  v_work jsonb := null;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if p_on and v_loc not in ('본원', '화정센터', '민초센터', '정리정독') then
    raise exception 'bad_loc';
  end if;
  if not p_on then
    select loc into v_loc from public.msg_presence where user_id = v_me.user_id;
    v_loc := coalesce(v_loc, '');
  end if;
  insert into public.msg_presence (user_id, name, loc, is_on, changed_at)
  values (v_me.user_id, v_me.display_name, v_loc, p_on, now())
  on conflict (user_id) do update set
    name = excluded.name, loc = excluded.loc, is_on = excluded.is_on, changed_at = now()
  returning * into v_row;
  insert into public.msg_presence_log (user_id, name, loc, is_on) values (v_me.user_id, v_me.display_name, v_loc, p_on);

  if exists (select 1 from public.work_staff s where s.user_id = v_me.user_id and s.active) then
    select * into v_rec from public.work_records
      where user_id = v_me.user_id and ymd = v_today and out_at is null
      order by id desc limit 1 for update;
    if p_on then
      if v_rec.id is null then
        perform private.work_fill(v_today, v_today);
        select min(start_hm) into v_sched from public.work_shifts where ymd = v_today and user_id = v_me.user_id;
        v_start := now();
        if v_sched is not null and (v_today + v_sched::time) at time zone 'Asia/Seoul' > v_start then
          v_start := (v_today + v_sched::time) at time zone 'Asia/Seoul';
        end if;
        insert into public.work_records (ymd, user_id, name, loc, in_at, start_at)
        values (v_today, v_me.user_id, v_me.display_name, v_loc, now(), v_start)
        returning * into v_rec;
        v_work := jsonb_build_object('id', v_rec.id, 'event', 'in', 'sched', v_sched,
          'start', to_char(v_start at time zone 'Asia/Seoul', 'HH24:MI'), 'clipped', v_start > v_rec.in_at);
      end if;
    elsif v_rec.id is not null then
      update public.work_records set out_at = now(), updated_at = now() where id = v_rec.id returning * into v_rec;
      v_work := jsonb_build_object('id', v_rec.id, 'event', 'out',
        'start', to_char(v_rec.start_at at time zone 'Asia/Seoul', 'HH24:MI'),
        'minutes', greatest(0, floor(extract(epoch from (v_rec.out_at - v_rec.start_at)) / 60))::int);
    end if;
  end if;
  return to_jsonb(v_row) || jsonb_build_object('work', v_work);
end;
$$;
revoke all on function public.msg_presence_set(text, boolean) from public, anon;
grant execute on function public.msg_presence_set(text, boolean) to authenticated;

comment on table public.work_staff is '조교 근무 일지 — 사람과 시급(본인·원장님·대표님만 읽음)';
comment on table public.work_roster is '조교 근무 일지 — 기본 근무표(요일×센터×자리)';
comment on table public.work_shifts is '조교 근무 일지 — 날짜별 근무표와 근무자 교체';
comment on table public.work_records is '조교 근무 일지 — 슈톡 출근·퇴근으로 쌓이는 실제 근무 기록';
