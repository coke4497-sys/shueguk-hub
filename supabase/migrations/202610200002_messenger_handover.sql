-- 슈톡 할 일 넘기기(위임) · 미루기(언제까지 하겠다) + 기록 (2026-10-20 원장님 "업무 리스트 다른 구성원에게 위임 기능 추가, 미룸 기능 추가 언제까지 하겠다 기록")
--   msg_tasks.history  : 넘기기·미루기 기록 [{kind:'넘김'|'미룸'|'미룸 해제', from, to, until, by, at, note}] — 카드에 기록 리스트로 보인다
--   msg_tasks.due_at·due_note : 미룬 할 일의 '이때까지 하겠다' 시각·메모(지나면 화면이 '약속 지남'으로)
--   msg_tasks.hand_push·hand_by : 넘겨받은 사람에게 보낼 휴대폰 알림 자리(함수 msg-push action 'hand'가 한 번만 보내고 비운다)
--   msg_task_delegate(p_id, p_to, p_note) — 맡은 사람·맡긴 사람·관리자, @모두 할 일은 넘기지 않음
--   msg_task_defer(p_id, p_until, p_note) — 맡은 사람만, p_until 이 비면 미룸을 푼다(60일 안, 지금보다 뒤)
--   202610200001 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_tasks add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.msg_tasks add column if not exists due_at timestamptz;
alter table public.msg_tasks add column if not exists due_note text not null default '';
alter table public.msg_tasks add column if not exists hand_push uuid;
alter table public.msg_tasks add column if not exists hand_by uuid;

create or replace function public.msg_task_delegate(p_id bigint, p_to uuid, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
  v_to public.teacher_accounts;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  if v_t.assignee is distinct from v_me.user_id and v_t.requester is distinct from v_me.user_id and v_me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_t.ack_only then
    raise exception 'ack_only';   -- @모두 할 일은 사람마다 확인하는 것이라 넘기지 않는다
  end if;
  if v_t.status <> '대기' then
    raise exception 'not_pending';
  end if;
  select * into v_to from public.teacher_accounts where user_id = p_to and active;
  if v_to.user_id is null then
    raise exception 'bad_person';
  end if;
  if v_to.user_id is not distinct from v_t.assignee then
    raise exception 'same_person';
  end if;
  if length(v_note) > 200 then
    raise exception 'too_long';
  end if;
  update public.msg_tasks set
    history = history || jsonb_build_array(jsonb_build_object('kind', '넘김', 'from', v_t.assignee_name, 'to', v_to.display_name,
      'by', v_me.display_name, 'at', now(), 'note', v_note)),
    assignee = v_to.user_id, assignee_name = v_to.display_name,
    seen_at = null, due_at = null, due_note = '',
    hand_push = v_to.user_id, hand_by = v_me.user_id,
    updated_at = now()
  where id = p_id returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

create or replace function public.msg_task_defer(p_id bigint, p_until timestamptz, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  -- '언제까지 하겠다'는 맡은 사람의 약속 — 맡은 사람만(관리자도 대신 정하지 않음 — Codex 검토)
  if v_t.assignee is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_t.status <> '대기' then
    raise exception 'not_pending';
  end if;
  if length(v_note) > 200 then
    raise exception 'too_long';
  end if;
  if p_until is null then
    if v_t.due_at is null then
      return to_jsonb(v_t);
    end if;
    update public.msg_tasks set
      history = history || jsonb_build_array(jsonb_build_object('kind', '미룸 해제', 'by', v_me.display_name, 'at', now(), 'note', v_note)),
      due_at = null, due_note = '', updated_at = now()
    where id = p_id returning * into v_t;
    return to_jsonb(v_t);
  end if;
  if p_until <= now() or p_until > now() + interval '60 days' then
    raise exception 'bad_until';
  end if;
  update public.msg_tasks set
    history = history || jsonb_build_array(jsonb_build_object('kind', '미룸', 'until', p_until, 'by', v_me.display_name, 'at', now(), 'note', v_note)),
    due_at = p_until, due_note = v_note, seen_at = coalesce(seen_at, now()),
    updated_at = now()
  where id = p_id returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

revoke all on function public.msg_task_delegate(bigint, uuid, text) from public, anon;
revoke all on function public.msg_task_defer(bigint, timestamptz, text) from public, anon;
grant execute on function public.msg_task_delegate(bigint, uuid, text) to authenticated;
grant execute on function public.msg_task_defer(bigint, timestamptz, text) to authenticated;
