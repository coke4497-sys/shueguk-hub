-- 슈톡 할 일 '진행 중' 표시 (2026-10-20 원장님 강사 관리 "업무 진행상황 완료 진행중 미룸 위임 삭제" → 취소·넘기기·미루기(202610200001~0002) 위에 '진행 중'만 더함)
--   상태(status)는 그대로 '대기'이고 progress_at·progress_by 로 '지금 하고 있다'를 표시한다 — 취소·넘기기·미루기·체크 규칙을 바꾸지 않으려고.
--   progress_by 가 지금 맡은 사람(assignee_name)일 때만 진행 중으로 본다(넘겨받은 사람에게 앞사람 표시가 따라가지 않게).
--   msg_task_progress(p_id, p_on) — 맡은 사람만(미루기와 같음), 대기·@모두 아님. history 에 {kind:'진행 중'|'진행 해제', by, at} 한 줄.
-- 202610200002 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_tasks add column if not exists progress_at timestamptz;
alter table public.msg_tasks add column if not exists progress_by text not null default '';

create or replace function public.msg_task_progress(p_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
  v_now boolean;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  if v_t.assignee is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_t.status <> '대기' then
    raise exception 'not_pending';
  end if;
  if v_t.ack_only then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_now := v_t.progress_at is not null and v_t.progress_by = v_t.assignee_name;
  if v_now = coalesce(p_on, false) then
    return to_jsonb(v_t);
  end if;
  update public.msg_tasks set
    progress_at = case when p_on then now() else null end,
    progress_by = case when p_on then v_me.display_name else '' end,
    seen_at = case when p_on then coalesce(seen_at, now()) else seen_at end,
    history = history || jsonb_build_array(jsonb_build_object('kind', case when p_on then '진행 중' else '진행 해제' end, 'by', v_me.display_name, 'at', now())),
    updated_at = now()
  where id = p_id returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

revoke all on function public.msg_task_progress(bigint, boolean) from public, anon;
grant execute on function public.msg_task_progress(bigint, boolean) to authenticated;
