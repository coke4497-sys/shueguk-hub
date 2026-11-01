-- 슈톡 출근·퇴근 시각 고치기 — 원장님만 (2026-11-01 원장님 "시각 고치기 요청 기능" → "아니요. 저만 가능하게")
-- 퇴근 버튼을 누르지 않았거나 늦게 누른 기록을 원장님이 강사 관리(staff.html)에서 직접 고친다. 요청·승인 절차는 없다.
-- 고치는 단위 = 근무 한 구간(출근 줄 + 퇴근 줄). 출근 줄이 없으면 새 구간(출근·퇴근 두 줄)을 넣는다.
-- 고친 내용은 msg_presence_fixes 에 전·후로 남긴다(원장님만 읽음). 조교 급여용 근무 일지(work_records)는 건드리지 않는다.
-- 다시 실행해도 안전하다.

create table if not exists public.msg_presence_fixes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null,
  name text not null default '',
  ymd date,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  reason text not null default '',
  by_name text not null default ''
);
create index if not exists msg_presence_fixes_user on public.msg_presence_fixes (user_id, ymd);
alter table public.msg_presence_fixes enable row level security;
revoke all on table public.msg_presence_fixes from public, anon, authenticated;
grant select on table public.msg_presence_fixes to authenticated;

-- 고칠 수 있는 사람 = 활성 관리자(원장님)
create or replace function private.presence_fixer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_accounts t
    where t.user_id = (select auth.uid()) and t.active and t.role = 'admin'
  );
$$;
revoke all on function private.presence_fixer() from public;
grant execute on function private.presence_fixer() to authenticated;

drop policy if exists msg_presence_fixes_read on public.msg_presence_fixes;
create policy msg_presence_fixes_read on public.msg_presence_fixes
  for select to authenticated using ((select private.presence_fixer()));

-- p_in_id: 고칠 구간의 출근 줄(null 이면 새 구간) · p_out_id: 그 구간의 퇴근 줄(null 이면 퇴근 줄을 새로 넣음)
create or replace function public.msg_presence_fix(
  p_user uuid, p_in_id bigint, p_out_id bigint, p_loc text, p_in timestamptz, p_out timestamptz, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_by text;
  v_t public.teacher_accounts;
  v_loc text := btrim(coalesce(p_loc, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_in public.msg_presence_log;
  v_out public.msg_presence_log;
  v_last public.msg_presence_log;
  v_in_id bigint := p_in_id;
  v_out_id bigint := p_out_id;
  v_ymd date;
  v_before jsonb := '{}'::jsonb;
begin
  if not private.presence_fixer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select display_name into v_by from public.teacher_accounts where user_id = (select auth.uid());
  select * into v_t from public.teacher_accounts where user_id = p_user;
  if v_t.user_id is null then raise exception 'no_user'; end if;
  if v_loc not in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터') then raise exception 'bad_loc'; end if;
  if v_reason = '' then raise exception 'need_reason'; end if;
  if char_length(v_reason) > 200 then raise exception 'too_long'; end if;
  if p_in is null or p_out is null then raise exception 'need_time'; end if;
  if p_out <= p_in then raise exception 'bad_order'; end if;
  if p_out > now() + interval '1 minute' then raise exception 'future'; end if;
  if p_out - p_in > interval '18 hours' then raise exception 'too_long_shift'; end if;
  -- 근무일(새벽 5시 경계)이 같아야 한다
  v_ymd := ((p_in at time zone 'Asia/Seoul') - interval '5 hours')::date;
  if ((p_out at time zone 'Asia/Seoul') - interval '5 hours')::date <> v_ymd then raise exception 'cross_day'; end if;
  if v_ymd < (now() at time zone 'Asia/Seoul')::date - 92 then raise exception 'too_old'; end if;

  -- 같은 사람 기록은 한 번에 하나씩(출근 스위치와 겹치지 않게)
  perform pg_advisory_xact_lock(hashtext('presence:' || p_user::text));

  if v_in_id is not null then
    select * into v_in from public.msg_presence_log where id = v_in_id for update;
    if v_in.id is null or v_in.user_id <> p_user or not v_in.is_on then raise exception 'bad_in'; end if;
    v_before := v_before || jsonb_build_object('in', v_in.at, 'loc', v_in.loc);
  end if;
  if v_out_id is not null then
    if v_in_id is null then raise exception 'bad_out'; end if;
    select * into v_out from public.msg_presence_log where id = v_out_id for update;
    if v_out.id is null or v_out.user_id <> p_user or v_out.is_on or v_out.at < v_in.at then raise exception 'bad_out'; end if;
    -- 출근 줄 바로 다음 줄이어야 한다(사이에 다른 출근이 끼어 있으면 다른 구간)
    if exists (select 1 from public.msg_presence_log l where l.user_id = p_user and l.id not in (v_in.id, v_out.id)
               and l.at > v_in.at and l.at < v_out.at) then raise exception 'bad_out'; end if;
    v_before := v_before || jsonb_build_object('out', v_out.at);
  end if;

  -- 새 시각 사이에 다른 출퇴근 줄이 있으면 겹친다
  if exists (select 1 from public.msg_presence_log l where l.user_id = p_user
             and l.id is distinct from v_in_id and l.id is distinct from v_out_id
             and l.at >= p_in and l.at <= p_out) then
    raise exception 'overlap';
  end if;
  -- 새 구간이 같은 근무일의 열린 구간(출근 뒤 아직 다음 기록이 없는 사이) 안에 들어가도 겹친다
  if v_in_id is null and exists (
       select 1 from (select l.is_on, l.at from public.msg_presence_log l where l.user_id = p_user and l.at < p_in
                      order by l.at desc, l.id desc limit 1) prev
       where prev.is_on and ((prev.at at time zone 'Asia/Seoul') - interval '5 hours')::date = v_ymd) then
    raise exception 'overlap';
  end if;
  -- 퇴근 줄을 새로 넣는 경우, 출근 줄 뒤 바로 다음 줄이 이미 퇴근이면 그 퇴근을 고쳐야 한다(퇴근 두 번 방지)
  if v_in_id is not null and v_out_id is null and exists (
       select 1 from public.msg_presence_log l where l.user_id = p_user and l.id <> v_in.id and l.at > v_in.at
         and not l.is_on and not exists (select 1 from public.msg_presence_log m where m.user_id = p_user
           and m.id <> v_in.id and m.at > v_in.at and m.at < l.at)
         and ((l.at at time zone 'Asia/Seoul') - interval '5 hours')::date = v_ymd) then
    raise exception 'has_out';
  end if;

  if v_in_id is null then
    insert into public.msg_presence_log (user_id, name, loc, is_on, at) values (p_user, v_t.display_name, v_loc, true, p_in) returning id into v_in_id;
  else
    update public.msg_presence_log set at = p_in, loc = v_loc where id = v_in_id;
  end if;
  if v_out_id is null then
    insert into public.msg_presence_log (user_id, name, loc, is_on, at) values (p_user, v_t.display_name, v_loc, false, p_out) returning id into v_out_id;
  else
    update public.msg_presence_log set at = p_out, loc = v_loc where id = v_out_id;
  end if;

  -- 지금 출근 표시(msg_presence)는 그 사람의 마지막 기록에 맞춘다(퇴근을 넣으면 '출근 중'이 꺼진다)
  select * into v_last from public.msg_presence_log where user_id = p_user order by at desc, id desc limit 1;
  insert into public.msg_presence (user_id, name, loc, is_on, changed_at)
  values (p_user, v_t.display_name, v_last.loc, v_last.is_on, v_last.at)
  on conflict (user_id) do update set loc = excluded.loc, is_on = excluded.is_on, changed_at = excluded.changed_at;

  insert into public.msg_presence_fixes (user_id, name, ymd, before, after, reason, by_name)
  values (p_user, v_t.display_name, v_ymd, v_before,
          jsonb_build_object('in', p_in, 'out', p_out, 'loc', v_loc), v_reason, coalesce(v_by, ''));
  return jsonb_build_object('in_id', v_in_id, 'out_id', v_out_id, 'ymd', v_ymd);
end;
$$;

revoke all on function public.msg_presence_fix(uuid, bigint, bigint, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.msg_presence_fix(uuid, bigint, bigint, text, timestamptz, timestamptz, text) to authenticated;

comment on table public.msg_presence_fixes is '슈톡 출근·퇴근 시각을 원장님이 고친 기록 — 전·후·사유';
comment on function public.msg_presence_fix(uuid, bigint, bigint, text, timestamptz, timestamptz, text) is '출근·퇴근 시각 고치기(원장님만)';
