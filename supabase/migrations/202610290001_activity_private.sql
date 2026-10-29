-- 티쳐스 활동 알림을 슈톡 밖으로 — 원장님만 보는 알림·기록 (2026-10-29 원장님 "원장님께 알림이 모두에게 보이나요?" → '따로 두기')
--
-- 202610270001 은 활동 알림을 슈톡 대화방 글('활동 알림')로 올렸다. 슈톡은 대화방이 하나라 그 글이 활성 교사 전원에게 보였다
-- (휴대폰 푸시만 원장님께). 이제 슈톡에는 올리지 않는다:
-- · activity_notices — 알림 글(즉시 한 건 · 2시간 묶음 요약)을 이 표에 적고, 엣지 함수 `activity`가 원장님(활성 admin) 기기에만 푸시한다
--   (_shared/push.ts pushActivity — 알림을 누르면 허브 activity.html 로). pushed_at = 보낸 자리, push_retry = 일부 기기만 못 받았을 때 그 기기들.
-- · activity_log.message_id → notice_id (알린 글 번호 = activity_notices.id). 옛 값(2026-10-29 전)은 슈톡 글 번호라 그대로 둔다.
-- · activity_log·activity_notices 읽기 = 원장님(활성 admin)만 — private.activity_viewer(). 다른 교사는 0줄.
-- · activity_say(슈톡 글 올리기)는 지운다. 그전에 올라간 슈톡 글은 기록이라 그대로.
-- 쓰기는 여전히 엣지 함수(service_role)만.

create or replace function private.activity_viewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_accounts t
    where t.user_id = (select auth.uid()) and t.active and t.role = 'admin'
  );
$$;
revoke all on function private.activity_viewer() from public;
grant execute on function private.activity_viewer() to authenticated;   -- RLS 정책이 교사 신분으로 부른다(is_active_teacher·work_viewer 와 같음)

-- 기록 표: 읽기를 원장님으로 좁힘 + 알린 글 번호 열 이름
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='message_id')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='notice_id') then
    alter table public.activity_log rename column message_id to notice_id;
  end if;
end $$;
drop index if exists public.activity_log_pending_idx;
create index if not exists activity_log_pending_idx on public.activity_log (at) where notice_id is null and not urgent;
drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log for select to authenticated using ((select private.activity_viewer()));

-- 알림 글 표
create table if not exists public.activity_notices (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null default '즉시' check (kind in ('즉시', '요약')),
  text text not null,
  pushed_at timestamptz,
  push_retry jsonb
);
create index if not exists activity_notices_at_idx on public.activity_notices (at desc);
alter table public.activity_notices enable row level security;
drop policy if exists activity_notices_read on public.activity_notices;
create policy activity_notices_read on public.activity_notices for select to authenticated using ((select private.activity_viewer()));
revoke all on public.activity_notices from anon, authenticated;
grant select on public.activity_notices to authenticated;
grant all on public.activity_notices to service_role;
grant usage on sequence public.activity_notices_id_seq to service_role;

-- 슈톡 글 올리기는 더 쓰지 않는다
drop function if exists public.activity_say(text, uuid[]);
