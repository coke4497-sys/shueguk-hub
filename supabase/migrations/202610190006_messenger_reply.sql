-- 슈톡 답장 (2026-10-19 원장님 제안 6번 "답장(인용)")
--   msg_messages.reply_to : 이 메시지가 답한 메시지 (지워져도 남김 — 화면이 '삭제된 메시지'로 보여 줌)
--   msg_send(…, p_reply)  : 네 번째 인자로 답할 메시지 id (없는 id는 bad_reply). 나머지는 202610190005와 같다.
-- 옛 세 인자 함수는 지우고 네 인자(기본 null)로 바꾼다 — 세 인자로 부르는 화면도 그대로 된다.
-- 202610190005 다음에 적용한다. 다시 실행해도 안전하다(단 이 뒤에 0005를 다시 실행하면 세 인자 함수가 되살아나 이름이 겹치니 0006도 다시 실행할 것).

alter table public.msg_messages add column if not exists reply_to bigint references public.msg_messages(id) on delete set null;

drop function if exists public.msg_send(text, jsonb, uuid[]);

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
  select v_id, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text, v_all
  from public.teacher_accounts t
  where t.active and t.user_id = any (v_ids)
    and (not v_all or t.user_id <> v_me.user_id)   -- @모두는 나를 늘 뺀다(내 이름을 함께 적어도 — Codex 검토)
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
