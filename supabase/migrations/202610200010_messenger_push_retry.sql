-- 슈톡 알림 — 일부 기기만 실패한 메시지를 그 기기에만 다시 보내기 (2026-10-20 Codex 검토)
-- 한 기기라도 받으면 pushed_at 이 남아 다시 보내지 않았다 — 그래서 실패한 기기(msg_push_subs.id)만 push_retry 에 적어 두고,
-- 클로슈 순찰(엣지 함수 closhu feed)이 그 기기에만 다시 보낸다(받은 기기에는 두 번 가지 않게). 다시 돌려도 된다.
alter table public.msg_messages add column if not exists push_retry jsonb;
create index if not exists msg_messages_push_retry on public.msg_messages (id) where push_retry is not null;

-- 넘김 알림(msg-push hand)도 일부 기기만 실패하면 그 기기만 적는다 — {to, by, subs:[id…]} (Codex 검토)
alter table public.msg_tasks add column if not exists hand_retry jsonb;
create index if not exists msg_tasks_hand_retry on public.msg_tasks (id) where hand_retry is not null;

-- 다시 보낼 목록을 비우며 잡고 옛 값을 돌려준다(한 문장 안에서 — 두 순찰이 겹쳐도 한쪽만 잡음). service_role 만.
create or replace function public.msg_push_retry_claim(p_id bigint)
returns jsonb
language sql security definer set search_path = ''
as $$
  with o as (select id, push_retry from public.msg_messages
             where id = p_id and push_retry is not null and deleted_at is null for update)
  update public.msg_messages m set push_retry = null from o where m.id = o.id returning o.push_retry;
$$;
revoke all on function public.msg_push_retry_claim(bigint) from public, anon, authenticated;
grant execute on function public.msg_push_retry_claim(bigint) to service_role;

create or replace function public.msg_hand_retry_claim(p_id bigint)
returns jsonb
language sql security definer set search_path = ''
as $$
  with o as (select id, hand_retry from public.msg_tasks
             where id = p_id and hand_retry is not null for update)
  update public.msg_tasks t set hand_retry = null from o where t.id = o.id returning o.hand_retry;
$$;
revoke all on function public.msg_hand_retry_claim(bigint) from public, anon, authenticated;
grant execute on function public.msg_hand_retry_claim(bigint) to service_role;

-- 새로 넘기면(hand_push 가 새로 정해지면) 앞 넘김의 재시도 정보는 버린다 — A→B→A 로 다시 넘겼을 때 낡은 알림이 가지 않게 (Codex 검토)
create or replace function private.msg_hand_retry_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.hand_push is not null and new.hand_push is distinct from old.hand_push then
    new.hand_retry := null;
  end if;
  return new;
end;
$$;
drop trigger if exists msg_tasks_hand_retry_reset on public.msg_tasks;
create trigger msg_tasks_hand_retry_reset before update of hand_push on public.msg_tasks
  for each row execute function private.msg_hand_retry_reset();
