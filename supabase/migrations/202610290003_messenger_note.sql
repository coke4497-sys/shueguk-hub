-- 슈톡 — 쪽지 보내기 (2026-10-29 원장님 "개인에게, 또는 복수 선택한 인원에게 쪽지를 보내고 받은 쪽지는 업무 진행 상황 리스트에 쌓이고 거기에서 확인 처리")
-- 쪽지 = 대화에 글을 남기지 않는, 메시지 없는 할 일(202610250002 꼴) — 받는 사람마다 한 줄.
--   · 맡은 사람 = 받는 사람, 맡긴 사람 = 보낸 사람(requester_name 이 카드에 '쪽지 · 이름'으로 보임), note 표시
--   · 확인만 하면 끝(ack_only — @모두와 같이 [확인]이 곧 완료, msg_task_seen). 넘기기·진행 중은 없음(ack_only 규칙 그대로), 취소는 보낸 사람·관리자.
--   · 받는 사람 휴대폰 알림은 넘김 알림과 같은 길 — hand_push·hand_by 를 채워 두면 화면이 msg-push {action:'hand'} 로 한 번만 보낸다
--     (제목 '○○ → 나에게 쪽지' — _shared/push.ts handPlan 의 note 가름, msg-push 를 다시 배포해야 제목이 바뀐다).
--   · 받는 사람은 활성 교사만, 보낸 사람 본인은 빠진다. 아무도 남지 않으면 no_recipient. 글은 1~300자(msg_tasks.text 제약 300자와 같게 — Codex 검토).
-- 다시 실행해도 안전하다.
alter table public.msg_tasks add column if not exists note boolean not null default false;

create or replace function public.msg_note_send(p_to uuid[], p_text text)
returns setof public.msg_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_text text := btrim(coalesce(p_text, ''));
  v_ids uuid[];
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if v_text = '' then raise exception 'empty'; end if;
  if char_length(v_text) > 300 then raise exception 'too_long'; end if;
  select array_agg(distinct t.user_id) into v_ids
    from unnest(coalesce(p_to, '{}'::uuid[])) as u(id)
    join public.teacher_accounts t on t.user_id = u.id and t.active
   where t.user_id <> v_me.user_id;
  if v_ids is null or array_length(v_ids, 1) is null then raise exception 'no_recipient'; end if;
  return query
    insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, ack_only, note, hand_push, hand_by)
    select null, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text, true, true, t.user_id, v_me.user_id
      from public.teacher_accounts t
     where t.user_id = any(v_ids)
     order by t.display_name
    returning *;
end;
$$;
revoke all on function public.msg_note_send(uuid[], text) from public, anon;
grant execute on function public.msg_note_send(uuid[], text) to authenticated;
