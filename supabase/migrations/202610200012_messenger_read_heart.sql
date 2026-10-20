-- 슈톡 읽음 숫자 · 공감(하트) (2026-10-20 원장님 "카톡 대화처럼 전체 인원이 대화 아래 숫자로 뜨고 확인한 사람, 아직 확인하지 않은 사람을 리스트로 확인할 수 있게 해줘. 공감(하트) 버튼을 만들어줘")
--   msg_reads          : 사람마다 한 줄 — 어디까지 읽었는지(가장 큰 메시지 번호). 기기가 여럿이어도 가장 멀리 읽은 곳.
--                        메시지 아래 숫자 = 그 메시지를 아직 안 읽은 사람 수(쓴 사람 빼고, 지금 활성 교사).
--   msg_messages.hearts : 공감(하트)을 누른 사람 목록. 누르면 updated_at 이 바뀌어 다른 화면도 3초 폴링으로 받는다.
-- 쓰기는 함수(msg_read_mark·msg_heart)로만, 읽기는 활성 교사만. 202610190001 다음에 적용한다. 다시 실행해도 안전하다.

create table if not exists public.msg_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_id bigint not null default 0,
  at timestamptz not null default now()
);
alter table public.msg_reads enable row level security;
revoke all on table public.msg_reads from anon, authenticated;
grant select on table public.msg_reads to authenticated;
drop policy if exists msg_reads_read on public.msg_reads;
create policy msg_reads_read on public.msg_reads
  for select to authenticated using ((select private.is_active_teacher()));

-- 처음 적용할 때 지금 활성 교사는 지금까지의 대화를 모두 읽은 것으로 둔다(지난 대화마다 숫자가 가득 뜨지 않게)
insert into public.msg_reads (user_id, last_id)
select t.user_id, coalesce((select max(id) from public.msg_messages), 0)
from public.teacher_accounts t where t.active
on conflict (user_id) do nothing;

-- 여기까지 읽음 — 뒤로 가지 않는다(가장 큰 값만 남김), 없는 번호보다 크게는 못 적는다
create or replace function public.msg_read_mark(p_id bigint)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_id bigint := least(coalesce(p_id, 0), coalesce((select max(id) from public.msg_messages), 0));
  v_last bigint;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  insert into public.msg_reads (user_id, last_id, at) values (v_me.user_id, greatest(v_id, 0), now())
  on conflict (user_id) do update set last_id = greatest(public.msg_reads.last_id, excluded.last_id), at = now()
  returning last_id into v_last;
  return v_last;
end;
$$;
revoke all on function public.msg_read_mark(bigint) from public, anon;
grant execute on function public.msg_read_mark(bigint) to authenticated;

alter table public.msg_messages add column if not exists hearts uuid[] not null default '{}'::uuid[];

-- 공감(하트) 누르기·풀기 — 나만 넣고 뺀다, 지운 메시지에는 못 누른다
create or replace function public.msg_heart(p_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.msg_messages;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_row from public.msg_messages where id = p_id for update;
  if v_row.id is null then
    raise exception 'not_found';
  end if;
  if v_row.deleted_at is not null then
    raise exception 'deleted';
  end if;
  if p_on and not (v_me.user_id = any(v_row.hearts)) then
    update public.msg_messages set hearts = array_append(hearts, v_me.user_id), updated_at = now() where id = p_id returning * into v_row;
  elsif not p_on and v_me.user_id = any(v_row.hearts) then
    update public.msg_messages set hearts = array_remove(hearts, v_me.user_id), updated_at = now() where id = p_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.msg_heart(bigint, boolean) from public, anon;
grant execute on function public.msg_heart(bigint, boolean) to authenticated;

comment on table public.msg_reads is '슈톡 읽은 자리 — 사람마다 가장 멀리 읽은 메시지 번호(메시지 아래 안 읽은 사람 수)';
comment on column public.msg_messages.hearts is '슈톡 공감(하트)을 누른 사람';
