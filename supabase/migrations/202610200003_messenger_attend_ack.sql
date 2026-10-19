-- 슈톡 결석·지각·이동 꼬리표 = 담당 선생님 확인 요청 (2026-10-20 원장님 "결석, 지각, 이동은 담당 선생님의 업무 목록에서 확인 버튼을 누르도록. 선생님 본인이 슈톡에 올린 경우 업무 목록에 올리지 마")
--   본문이 [결석]·[지각]·[이동]으로 시작하면 그 메시지의 할 일은 ack_only(확인을 누르면 끝)로 만들고, 보낸 사람 본인은 늘 뺀다.
--   받을 사람은 화면이 정한다 — @로 부른 사람, 없으면 학생 이름으로 찾은 담당 선생님(students.teacher).
--   202610190006 다음에 적용한다(네 인자 msg_send를 다시 정의). 다시 실행해도 안전하다.

create or replace function public.msg_send(p_body text, p_files jsonb default '[]'::jsonb, p_mentions uuid[] default '{}'::uuid[], p_reply bigint default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_body text := btrim(coalesce(p_body, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_text text;
  v_all boolean := v_body ~ '@(모두|전체)';
  v_att boolean := v_body ~ '^\[(결석|지각|이동)\]';   -- 결석·지각·이동 꼬리표 = 담당 선생님 '확인'만 (202610200003)
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

  if p_reply is not null and not exists (select 1 from public.msg_messages where id = p_reply) then
    raise exception 'bad_reply';
  end if;

  insert into public.msg_messages (author, author_name, body, files, reply_to)
  values (v_me.user_id, v_me.display_name, v_body, v_files, p_reply)
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
  select v_id, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text, v_all or v_att
  from public.teacher_accounts t
  where t.active and t.user_id = any (v_ids)
    and (not (v_all or v_att) or t.user_id <> v_me.user_id)   -- @모두·결석/지각/이동은 나를 늘 뺀다(선생님 본인이 올린 것은 업무 목록에 안 올림)
  order by t.display_name;

  return (
    select jsonb_build_object(
      'message', to_jsonb(m),
      'tasks', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.msg_tasks k where k.message_id = v_id), '[]'::jsonb))
    from public.msg_messages m where m.id = v_id
  );
end;
$$;

revoke all on function public.msg_send(text, jsonb, uuid[], bigint) from public, anon;
grant execute on function public.msg_send(text, jsonb, uuid[], bigint) to authenticated;
