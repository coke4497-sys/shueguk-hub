-- 슈톡 '확인했습니다' + @모두 (2026-10-19 원장님 "@이름으로 언급한 사람은 버튼을 눌러서 인지했다는 것을 표시" · "모두를 언급할 수 있는 방법도 필요")
--   msg_tasks.seen_at  : 맡은 사람이 [확인했습니다]를 누른 때 (완료와 따로 — 알았다는 표시)
--   msg_tasks.ack_only : @모두로 받은 할 일 — 확인만 누르면 완료된다(공지처럼)
--   msg_send  : 본문에 @모두·@전체가 있으면 나를 뺀 활성 교사 모두에게 할 일(ack_only), 할 일 글에서 @모두도 뺀다
--   msg_task_seen(p_id) : 맡은 사람만. 맡은 사람이 완료를 체크해도 확인으로 친다
-- 202610190004 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_tasks add column if not exists seen_at timestamptz;
alter table public.msg_tasks add column if not exists ack_only boolean not null default false;

create or replace function public.msg_send(p_body text, p_files jsonb default '[]'::jsonb, p_mentions uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_body text := btrim(coalesce(p_body, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_text text;
  v_all boolean := v_body ~ '@(모두|전체)';
  v_ids uuid[] := coalesce(p_mentions, '{}'::uuid[]);
  v_id bigint;
  r record;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 10 then
    raise exception 'bad_files';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_files) f
    where jsonb_typeof(f) <> 'object'
       or coalesce(f->>'path', '') !~ '^m/[0-9]{6}/[A-Za-z0-9]{16,40}(\.[A-Za-z0-9]{1,10})?$'
       or length(coalesce(f->>'name', '')) not between 1 and 200
  ) then
    raise exception 'bad_files';
  end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then
    raise exception 'empty';
  end if;
  if length(v_body) > 4000 then
    raise exception 'too_long';
  end if;

  -- @모두(@전체) = 나를 뺀 활성 교사 모두에게 '확인만 하면 되는' 할 일
  if v_all then
    v_ids := v_ids || array(select t.user_id from public.teacher_accounts t where t.active and t.user_id <> v_me.user_id);
  end if;

  insert into public.msg_messages (author, author_name, body, files)
  values (v_me.user_id, v_me.display_name, v_body, v_files)
  returning id into v_id;

  -- 할 일 글 = 메시지에서 @이름(뒤의 T·선생님·쌤·조교·님 — 한 칸 띄어도 — 포함)을 뺀 것
  v_text := v_body;
  for r in
    select t.display_name from public.teacher_accounts t
    where t.active and t.user_id = any (v_ids)
    order by length(t.display_name) desc
  loop
    v_text := regexp_replace(v_text,
      '@' || regexp_replace(r.display_name, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') || '( ?(T|선생님|쌤|조교|님))?',
      '', 'g');
  end loop;
  v_text := regexp_replace(v_text, '@(모두|전체)( ?(선생님|님|에게))?', '', 'g');
  v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
  if v_text = '' then
    v_text := case when jsonb_array_length(v_files) > 0 then '파일 확인' else '메시지 확인' end;
  end if;
  v_text := left(v_text, 300);

  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, ack_only)
  select v_id, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text, v_all
  from public.teacher_accounts t
  where t.active and t.user_id = any (v_ids)
  order by t.display_name;

  return (
    select jsonb_build_object(
      'message', to_jsonb(m),
      'tasks', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.msg_tasks k where k.message_id = v_id), '[]'::jsonb))
    from public.msg_messages m where m.id = v_id
  );
end;
$$;

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
    status = case when ack_only then '완료' else status end,
    done_by_name = case when ack_only and status <> '완료' then v_me.display_name else done_by_name end,
    done_at = case when ack_only and status <> '완료' then now() else done_at end,
    updated_at = now()
  where id = p_id
  returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

revoke all on function public.msg_send(text, jsonb, uuid[]) from public, anon;
revoke all on function public.msg_task_set(bigint, boolean) from public, anon;
revoke all on function public.msg_task_seen(bigint) from public, anon;
grant execute on function public.msg_send(text, jsonb, uuid[]) to authenticated;
grant execute on function public.msg_task_set(bigint, boolean) to authenticated;
grant execute on function public.msg_task_seen(bigint) to authenticated;
