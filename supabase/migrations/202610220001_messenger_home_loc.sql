-- 슈톡 '오늘의 슈국' 기본 센터 (2026-10-22 원장님 "시간표 상 본원에서 근무하는 배선주, 이승연 선생님을 추가. 신입 김사명 선생님은 본원,
--   박언호 대표님은 화정센터, 선생님들도 센터 선택 변경 가능하게")
--   msg_home_loc : 사람마다 한 줄 — 기본 센터. 근무표·시간표에 오늘 일정이 없어도 이 센터 카드에 보인다.
--   선생님·원장님은 기본 센터가 오늘 수업 위치보다 앞선다(본인이 고른 것). 조교는 오늘 근무표가 먼저.
--   쓰기는 msg_home_set 으로만 — 본인 또는 관리자. 읽기는 활성 교사. 다시 실행해도 안전하다.

create table if not exists public.msg_home_loc (
  user_id uuid primary key references auth.users(id) on delete cascade,
  loc text not null check (loc in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터')),
  updated_by_name text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.msg_home_loc enable row level security;
revoke all on table public.msg_home_loc from anon, authenticated;
grant select on table public.msg_home_loc to authenticated;
drop policy if exists msg_home_loc_read on public.msg_home_loc;
create policy msg_home_loc_read on public.msg_home_loc
  for select to authenticated using ((select private.is_active_teacher()));

-- 기본 센터 정하기 · 지우기(p_loc 빈 값)
create or replace function public.msg_home_set(p_user uuid, p_loc text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.teacher_accounts := private.msg_me();
  v_loc text := btrim(coalesce(p_loc, ''));
  v_user uuid := coalesce(p_user, me.user_id);
begin
  if me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if v_user is distinct from me.user_id and me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teacher_accounts t where t.user_id = v_user and t.active) then
    raise exception 'bad_user';
  end if;
  if v_loc = '' then
    delete from public.msg_home_loc where user_id = v_user;
    return jsonb_build_object('user_id', v_user, 'loc', '');
  end if;
  if v_loc not in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터') then
    raise exception 'bad_loc';
  end if;
  insert into public.msg_home_loc (user_id, loc, updated_by_name, updated_at)
    values (v_user, v_loc, me.display_name, now())
    on conflict (user_id) do update set loc = excluded.loc, updated_by_name = excluded.updated_by_name, updated_at = now();
  return jsonb_build_object('user_id', v_user, 'loc', v_loc);
end;
$$;
revoke all on function public.msg_home_set(uuid, text) from public, anon;
grant execute on function public.msg_home_set(uuid, text) to authenticated;

-- 처음 값(원장님 지정) — 이미 정해 둔 사람은 건드리지 않는다
insert into public.msg_home_loc (user_id, loc, updated_by_name)
select t.user_id, v.loc, '원장님 지정'
from (values ('배선주', '본원'), ('이승연', '본원'), ('김사명', '본원'), ('박언호', '화정센터')) as v(name, loc)
join public.teacher_accounts t on t.display_name = v.name and t.active
on conflict (user_id) do nothing;
