-- 슈톡 넘김 알림 — 위임 세대 번호 (Codex 검토)
-- 맡은 사람·넘긴 사람 쌍만으로는 A→B 알림을 보내는 사이 B→C→B 로 다시 넘긴 경우(쌍이 (B, A)로 되돌아옴)를 가리지 못한다.
-- 맡은 사람이 바뀔 때마다(넘기기는 늘 다른 사람에게) 세대를 하나 올리고, 알림 재시도 저장·되돌리기는 같은 세대일 때만 한다.
alter table public.msg_tasks add column if not exists hand_gen integer not null default 0;

create or replace function private.msg_hand_gen_bump()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.assignee is distinct from old.assignee then
    new.hand_gen := coalesce(old.hand_gen, 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists msg_tasks_hand_gen_bump on public.msg_tasks;
create trigger msg_tasks_hand_gen_bump before update of assignee on public.msg_tasks
  for each row execute function private.msg_hand_gen_bump();
