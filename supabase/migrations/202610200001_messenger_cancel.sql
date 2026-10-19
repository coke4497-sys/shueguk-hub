-- 슈톡 할 일 취소 + 사유 (2026-10-20 원장님 "업무 리스트에 있었는데 상황이 변경되어 이제 그 업무를 진행하지 않아도 된다면 삭제 사유기록 기능이 필요")
--   msg_tasks.status 에 '취소'를 더하고 cancel_reason(사유)을 남긴다. 줄을 지우지 않는다 — 누가 언제 왜 그만뒀는지 기록이 남게.
--   취소한 사람·시각은 done_by_name·done_at 에 적는다(오늘 완료처럼 그 날 카드에 보이고 다음 날 사라진다).
--   msg_task_cancel(p_id, p_reason, p_undo) — 맡긴 사람·맡은 사람·관리자(@모두 할 일은 맡긴 사람·관리자만). p_undo 면 '대기'로 되돌림.
--   202610190005·0006 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_tasks drop constraint if exists msg_tasks_status_check;
alter table public.msg_tasks add constraint msg_tasks_status_check check (status in ('대기', '완료', '취소'));
alter table public.msg_tasks add column if not exists cancel_reason text not null default '';

create or replace function public.msg_task_cancel(p_id bigint, p_reason text default '', p_undo boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  -- @모두 할 일은 받은 사람이 스스로 취소하지 않는다(확인만 하면 끝) — 맡긴 사람·관리자만
  if (v_t.ack_only and v_t.requester is distinct from v_me.user_id and v_me.role <> 'admin')
     or (not v_t.ack_only and v_t.assignee is distinct from v_me.user_id
         and v_t.requester is distinct from v_me.user_id and v_me.role <> 'admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_undo then
    if v_t.status <> '취소' then
      raise exception 'not_canceled';
    end if;
    update public.msg_tasks set status = '대기', cancel_reason = '', done_by_name = null, done_at = null, updated_at = now()
    where id = p_id returning * into v_t;
    return to_jsonb(v_t);
  end if;
  if v_t.status <> '대기' then
    raise exception 'not_pending';
  end if;
  if v_reason = '' then
    raise exception 'need_reason';
  end if;
  if length(v_reason) > 300 then
    raise exception 'too_long';
  end if;
  update public.msg_tasks set status = '취소', cancel_reason = v_reason, done_by_name = v_me.display_name, done_at = now(), updated_at = now()
  where id = p_id returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

-- 체크(완료)는 취소된 할 일에 쓰지 않는다 — 취소는 [되돌리기]로만 푼다
create or replace function public.msg_task_set(p_id bigint, p_done boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_t from public.msg_tasks where id = p_id for update;
  if v_t.id is null then
    raise exception 'not_found';
  end if;
  if v_t.assignee is distinct from v_me.user_id
     and v_t.requester is distinct from v_me.user_id
     and v_me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- @모두로 받은 할 일은 맡은 사람만(맡긴 사람·관리자가 대신 '확인'으로 만들지 못하게 — Codex 검토)
  if v_t.ack_only and v_t.assignee is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- @모두 할 일은 확인이 곧 완료라 되돌리지 않는다(확인·완료가 어긋나지 않게 — Codex 검토)
  if v_t.ack_only and not p_done then
    raise exception 'ack_locked';
  end if;
  if v_t.status = '취소' then
    raise exception 'canceled';
  end if;
  update public.msg_tasks set
    status = case when p_done then '완료' else '대기' end,
    done_by_name = case when p_done then v_me.display_name else null end,
    done_at = case when p_done then coalesce(case when v_t.status = '완료' then v_t.done_at end, now()) else null end,
    seen_at = case when p_done and v_t.assignee = v_me.user_id then coalesce(v_t.seen_at, now()) else v_t.seen_at end,
    updated_at = now()
  where id = p_id
  returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

-- 확인은 취소된 할 일이어도 '알았다'만 남긴다(@모두 확인이 취소를 완료로 덮지 않게)
create or replace function public.msg_task_seen(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_t public.msg_tasks;
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
  update public.msg_tasks set
    seen_at = coalesce(seen_at, now()),
    status = case when ack_only and status = '대기' then '완료' else status end,
    done_by_name = case when ack_only and status = '대기' then v_me.display_name else done_by_name end,
    done_at = case when ack_only and status = '대기' then now() else done_at end,
    updated_at = now()
  where id = p_id
  returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

revoke all on function public.msg_task_cancel(bigint, text, boolean) from public, anon;
grant execute on function public.msg_task_cancel(bigint, text, boolean) to authenticated;
revoke all on function public.msg_task_set(bigint, boolean) from public, anon;
revoke all on function public.msg_task_seen(bigint) from public, anon;
grant execute on function public.msg_task_set(bigint, boolean) to authenticated;
grant execute on function public.msg_task_seen(bigint) to authenticated;
