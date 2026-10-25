-- 슈톡 — 내 업무 직접 추가 (2026-10-25 원장님 "여기에 본인의 업무를 스스로 추가할 수 있는 기능")
-- 대화에 글을 남기지 않고 내 업무 카드에만 한 줄 — 메시지 없는 할 일이라 message_id 를 비울 수 있게 한다.
-- 맡은 사람 = 맡긴 사람 = 나, self_added 표시. 체크·진행 중·미루기·넘기기·취소는 다른 할 일과 같은 함수를 쓴다.
alter table public.msg_tasks alter column message_id drop not null;
alter table public.msg_tasks add column if not exists self_added boolean not null default false;

create or replace function public.msg_task_add(p_text text)
returns public.msg_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_text text := btrim(coalesce(p_text, ''));
  v_row public.msg_tasks;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if v_text = '' then raise exception 'empty'; end if;
  if char_length(v_text) > 300 then raise exception 'too_long'; end if;
  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, self_added)
  values (null, v_me.user_id, v_me.display_name, v_me.user_id, v_me.display_name, v_text, true)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.msg_task_add(text) from public, anon;
grant execute on function public.msg_task_add(text) to authenticated;
