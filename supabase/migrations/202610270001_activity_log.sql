-- 티쳐스 활동 기록 + 원장님 슈톡 알림 (2026-10-27 원장님 "누군가가 티쳐스 페이지에 시험범위를 입력하거나 시간표를 변경하거나
-- 지필고사 리포트를 변경하거나 모든 작업을 할 때 나에게 알람이 오면 좋겠어" → 섞기(중요한 것 즉시 · 잦은 것 묶음) + 누가 했는지 이름)
--
-- · activity_log — 화면이 한 일을 한 줄씩(언제·어느 화면·무엇을·대상·내용·누가·즉시 여부·알린 슈톡 글 번호).
--   쓰기는 엣지 함수 `activity`(service_role)만, 교사는 읽기만. 작성자는 함수가 허브 로그인(teacher_accounts)으로 확인한 이름.
-- · activity_say — 슈톡에 '활동 알림' 글(author 없음 · bot.kind 'activity' · to = 받을 사람(원장님)) 올리기, service_role 만.
--   알림(휴대폰 푸시)은 함수가 _shared/push.ts pushMessage 로 bot.to 기기에만 보낸다(클로슈 글과 같은 길).
create table if not exists public.activity_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  page text not null default '',
  what text not null,
  action text not null default '',
  target text not null default '',
  detail text not null default '',
  author text not null default '',
  author_uid uuid,
  urgent boolean not null default false,
  message_id bigint
);
create index if not exists activity_log_at_idx on public.activity_log (at desc);
create index if not exists activity_log_pending_idx on public.activity_log (at) where message_id is null and not urgent;
alter table public.activity_log enable row level security;
drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log for select to authenticated using (true);
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;
grant usage on sequence public.activity_log_id_seq to service_role;

create or replace function public.activity_say(p_text text, p_to uuid[])
returns public.msg_messages
language plpgsql security definer set search_path = ''
as $$
declare
  v_m public.msg_messages;
begin
  if p_text is null or length(btrim(p_text)) = 0 then raise exception 'empty'; end if;
  insert into public.msg_messages (author, author_name, body, files, reply_to, bot)
  values (null, '활동 알림', left(p_text, 4000), '[]'::jsonb, null,
          jsonb_build_object('kind', 'activity', 'to', to_jsonb(coalesce(p_to, '{}'::uuid[]))))
  returning * into v_m;
  return v_m;
end;
$$;
revoke all on function public.activity_say(text, uuid[]) from public, anon, authenticated;
grant execute on function public.activity_say(text, uuid[]) to service_role;
