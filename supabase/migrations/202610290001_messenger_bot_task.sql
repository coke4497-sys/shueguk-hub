-- 슈톡 — 클로슈가 사람의 업무 카드에 할 일을 올린다 (2026-10-29 원장님 "업무 진행 상황에 올려주세요")
-- 클로슈 글(msg_bot_say)은 할 일을 만들지 않으므로(지침: @이름을 쓰지 않음), 원장님이 클로드에게 부탁한 일을
-- 업무 진행 상황에 올릴 길이 없었다. 메시지 없는 할 일(202610250002 — message_id 비움)로 그 사람 카드에만 한 줄.
--   · 맡은 사람 = 맡긴 사람 = 그 사람(체크·진행 중·미루기·넘기기·취소를 본인이 할 수 있게), requester_name '클로슈'(카드 메타 표시)
--   · p_due 가 있으면 due_at·due_note 로 '언제까지' — 화면이 미룬 할 일과 같이 '… 까지'로 보여 주고, 지나면 '약속 지남' +
--     msg_bot_due(202610200008) 가 약속 지남 알림 글을 올린다. 지난 시각은 거절.
--   · p_key 로 한 번만(msg_bot_runs — 메시지 없이 열쇠만 남김, 같은 열쇠는 exists).
--   · service_role 만 실행 — 엣지 함수 closhu(action 'task') 가 부른다. 교사·공개 키는 실행 불가.
create or replace function public.msg_bot_task(p_to uuid, p_text text, p_due timestamptz default null,
  p_note text default '', p_key text default null)
returns public.msg_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_to public.teacher_accounts;
  v_text text := btrim(coalesce(p_text, ''));
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_row public.msg_tasks;
begin
  select t.* into v_to from public.teacher_accounts t where t.user_id = p_to and t.active limit 1;
  if v_to.user_id is null then raise exception 'bad_person'; end if;
  if v_text = '' then raise exception 'empty'; end if;
  if char_length(v_text) > 300 then raise exception 'too_long'; end if;
  if p_due is not null and p_due <= now() then raise exception 'past_due'; end if;
  if p_key is not null then
    insert into public.msg_bot_runs (key) values (left(p_key, 120)) on conflict (key) do nothing;
    if not found then raise exception 'exists'; end if;
  end if;
  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, due_at, due_note)
  values (null, v_to.user_id, v_to.display_name, v_to.user_id, '클로슈', v_text, p_due, case when p_due is null then '' else v_note end)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.msg_bot_task(uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.msg_bot_task(uuid, text, timestamptz, text, text) to service_role;
