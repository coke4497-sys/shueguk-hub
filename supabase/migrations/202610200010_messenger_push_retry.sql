-- 슈톡 알림 — 일부 기기만 실패한 메시지를 그 기기에만 다시 보내기 (2026-10-20 Codex 검토)
-- 한 기기라도 받으면 pushed_at 이 남아 다시 보내지 않았다 — 그래서 실패한 기기(msg_push_subs.id)만 push_retry 에 적어 두고,
-- 클로슈 순찰(엣지 함수 closhu feed)이 그 기기에만 다시 보낸다(받은 기기에는 두 번 가지 않게). 다시 돌려도 된다.
alter table public.msg_messages add column if not exists push_retry jsonb;
create index if not exists msg_messages_push_retry on public.msg_messages (id) where push_retry is not null;
