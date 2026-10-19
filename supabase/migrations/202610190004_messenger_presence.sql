-- 슈톡 출근·퇴근 표시 (2026-10-19 원장님 "출근 퇴근 표시 기능을 넣어서 구성원이 어느 센터 on, off 상태를 표시")
--   msg_presence     : 사람마다 한 줄 — 지금 어느 센터에 출근(ON)했는지, 퇴근(OFF)인지
--   msg_presence_log : 누르는 때마다 한 줄 — 언제 어디로 출근·퇴근했는지 기록(화면에는 보이지 않음)
-- 날짜가 바뀌면 화면이 어제 출근을 OFF로 본다(퇴근을 잊어도 다음 날은 OFF에서 시작).
-- 쓰기는 msg_presence_set 함수로만, 읽기는 활성 교사만. 202610190001 다음에 적용한다. 다시 실행해도 안전하다.

create table if not exists public.msg_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  loc text not null default '' check (length(loc) <= 20),
  is_on boolean not null default false,
  changed_at timestamptz not null default now()
);
create table if not exists public.msg_presence_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  loc text not null default '',
  is_on boolean not null,
  at timestamptz not null default now()
);
create index if not exists msg_presence_log_user on public.msg_presence_log (user_id, at desc);

alter table public.msg_presence enable row level security;
alter table public.msg_presence_log enable row level security;
revoke all on table public.msg_presence, public.msg_presence_log from anon, authenticated;
grant select on table public.msg_presence, public.msg_presence_log to authenticated;

drop policy if exists msg_presence_read on public.msg_presence;
create policy msg_presence_read on public.msg_presence
  for select to authenticated using ((select private.is_active_teacher()));
drop policy if exists msg_presence_log_read on public.msg_presence_log;
create policy msg_presence_log_read on public.msg_presence_log
  for select to authenticated using ((select private.is_active_teacher()));

-- 출근(p_on true, 센터 필수) · 퇴근(p_on false — 센터는 마지막 출근 센터를 남겨 둔다)
create or replace function public.msg_presence_set(p_loc text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_loc text := btrim(coalesce(p_loc, ''));
  v_row public.msg_presence;
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
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.msg_presence_set(text, boolean) from public, anon;
grant execute on function public.msg_presence_set(text, boolean) to authenticated;

comment on table public.msg_presence is '슈톡 출근·퇴근 — 사람마다 지금 센터와 ON/OFF';
comment on table public.msg_presence_log is '슈톡 출근·퇴근 기록 — 누를 때마다 한 줄';
