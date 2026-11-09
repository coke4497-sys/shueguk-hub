-- 슈톡 알림 근무일 (2026-11-09 원장님 "이한슬 선생님은 12월 16일부터 수목금토일 근무합니다. 근무 전 알람 끄기")
--   msg_alert_days : 사람마다 한 줄. 엣지 함수(_shared/push.ts)만 읽는다(service_role).
--   start_on 전 근무일에는 그 사람에게 슈톡 알림을 하나도 보내지 않는다(@이름·넘긴 일·클로슈 글까지).
--   start_on 부터는 dows(1=월 … 7=일) 요일이 '근무 일정이 있는 날'이 된다 — 시간표 수업·근무표가 없어도 메시지 알림을 받는다.
--   그 밖의 날은 종전 규칙(근무 일정 · 나에게 생긴 할 일). 다시 실행해도 안전하다.
create table if not exists public.msg_alert_days (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_on date,
  dows smallint[] not null default '{}' check (dows <@ array[1,2,3,4,5,6,7]::smallint[]),
  note text not null default '',
  updated_by_name text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.msg_alert_days enable row level security;
revoke all on table public.msg_alert_days from anon, authenticated;
