-- 슈톡 도우미 '클로슈' (2026-10-20 원장님 "슈톡에 클로슈가 들어와서 담당 선생님 배정에 부족한 정보를 추가 질문하고 업무를 도와줘"
--   → 원장님 선택: 규칙형 도우미(AI 없음), 배정 질문·남은 일 알림·오늘 요약·질문에 답하기)
--   msg_messages.bot : 클로슈가 쓴 메시지 표시({kind:'ask'|'due'|'summary'|'answer', …}) — author 는 비고 author_name '클로슈'
--   msg_tasks.due_alerted_at : 약속 시각 지남 알림을 이미 올렸는지(한 번만)
--   msg_bot_runs : 하루 한 번(오늘 정리)·질문마다 한 번(답) 같은 중복 방지 열쇠
--   쓰기는 모두 함수로만 — 글은 화면이 규칙으로 만들고, 함수가 누가·언제 쓸 수 있는지 확인한다.
--   202610200003 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_messages add column if not exists bot jsonb;
alter table public.msg_tasks add column if not exists due_alerted_at timestamptz;

create table if not exists public.msg_bot_runs (
  key text primary key,
  message_id bigint references public.msg_messages(id) on delete set null,
  at timestamptz not null default now()
);
alter table public.msg_bot_runs enable row level security;
revoke all on table public.msg_bot_runs from anon, authenticated;

-- 클로슈 메시지 한 줄 넣기(내부용)
create or replace function private.msg_bot_insert(p_body text, p_bot jsonb, p_reply bigint default null)
returns public.msg_messages
language plpgsql security definer set search_path = ''
as $$
declare v_m public.msg_messages;
begin
  insert into public.msg_messages (author, author_name, body, files, reply_to, bot)
  values (null, '클로슈', left(btrim(p_body), 4000), '[]'::jsonb, p_reply, p_bot)
  returning * into v_m;
  return v_m;
end;
$$;
revoke all on function private.msg_bot_insert(text, jsonb, bigint) from public, anon, authenticated;

-- ① 배정 질문 — [결석]·[지각]·[이동] 글의 담당 선생님을 못 찾았을 때 그 글을 쓴 사람이 부른다.
--    p_options = [{label, uid}] (활성 교사, 8개까지). 같은 글에는 한 번만.
create or replace function public.msg_bot_ask(p_msg bigint, p_text text, p_options jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_src public.msg_messages;
  v_m public.msg_messages;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_src from public.msg_messages where id = p_msg;
  if v_src.id is null or v_src.deleted_at is not null then
    raise exception 'not_found';
  end if;
  if v_src.author is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_src.body !~ '^\[(결석|지각|이동)\]' then
    raise exception 'not_attend';
  end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 1 and 12 then
    raise exception 'bad_options';
  end if;
  for o in select * from jsonb_array_elements(p_options) loop
    if not exists (select 1 from public.teacher_accounts t where t.active and t.user_id::text = o->>'uid') then
      raise exception 'bad_options';
    end if;
    v_opts := v_opts || jsonb_build_array(jsonb_build_object('label', left(coalesce(o->>'label', ''), 80), 'uid', o->>'uid'));
  end loop;
  insert into public.msg_bot_runs (key) values ('ask:' || p_msg) on conflict do nothing;
  if not found then
    raise exception 'exists';
  end if;
  -- 휴대폰 알림은 글쓴이와 보기에 있는 선생님에게만
  v_m := private.msg_bot_insert(left(coalesce(p_text, ''), 300), jsonb_build_object('kind', 'ask', 'for', p_msg, 'options', v_opts, 'by', v_me.display_name,
    'to', (select jsonb_agg(distinct x) from (select v_me.user_id::text as x union select o2->>'uid' from jsonb_array_elements(v_opts) o2) q)), p_msg);
  update public.msg_bot_runs set message_id = v_m.id where key = 'ask:' || p_msg;
  return to_jsonb(v_m);
end;
$$;

-- ② 배정 질문에 답하기 — 글쓴이·관리자·보기에 있는 선생님 본인이 고른다. 고른 사람에게 '확인만' 할 일을 만들고 넘김 알림 자리를 남긴다.
create or replace function public.msg_bot_pick(p_ask bigint, p_uid uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_ask public.msg_messages;
  v_src public.msg_messages;
  v_to public.teacher_accounts;
  v_text text;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_ask from public.msg_messages where id = p_ask for update;
  if v_ask.id is null or coalesce(v_ask.bot->>'kind', '') <> 'ask' then
    raise exception 'not_found';
  end if;
  if v_ask.bot ? 'done' then
    raise exception 'already';
  end if;
  -- 원글도 잠근다 — 지우는 중(msg_delete 가 원글을 먼저 잠금)에 새 할 일이 끼어들지 않게 (Codex 검토)
  select * into v_src from public.msg_messages where id = (v_ask.bot->>'for')::bigint for update;
  if v_src.id is null or v_src.deleted_at is not null then
    raise exception 'msg_deleted';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ask.bot->'options') x where x->>'uid' = p_uid::text) then
    raise exception 'bad_pick';
  end if;
  if v_src.author is distinct from v_me.user_id and v_me.role <> 'admin' and v_me.user_id <> p_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_to from public.teacher_accounts where user_id = p_uid and active;
  if v_to.user_id is null then
    raise exception 'bad_person';
  end if;
  -- 글쓴이 본인을 고르면(내 담당 학생) 할 일을 만들지 않고 답만 남긴다
  if v_to.user_id is distinct from v_src.author then
    v_text := left(btrim(regexp_replace(v_src.body, '\s+', ' ', 'g')), 300);
    if v_text = '' then v_text := '메시지 확인'; end if;
    insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, ack_only, hand_push, hand_by)
    values (v_src.id, v_to.user_id, v_to.display_name, v_src.author, v_src.author_name, v_text, true, v_to.user_id, v_me.user_id);
  end if;
  update public.msg_messages set
    bot = bot || jsonb_build_object('done', jsonb_build_object('to', v_to.display_name, 'uid', v_to.user_id, 'by', v_me.display_name, 'at', now(), 'task', v_to.user_id is distinct from v_src.author)),
    updated_at = now()
  where id = p_ask returning * into v_ask;
  return jsonb_build_object('message', to_jsonb(v_ask),
    'tasks', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.msg_tasks k where k.message_id = v_src.id), '[]'::jsonb));
end;
$$;

-- ③ 오늘 정리·질문 답 — 글은 화면이 만들고, 함수는 하루 한 번(summary)·질문마다 한 번(answer)만 받는다.
create or replace function public.msg_bot_post(p_kind text, p_text text, p_reply bigint default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_q public.msg_messages;
  v_key text;
  v_m public.msg_messages;
  v_day text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if btrim(coalesce(p_text, '')) = '' then
    raise exception 'empty';
  end if;
  if p_kind = 'summary' then
    if extract(hour from now() at time zone 'Asia/Seoul') < 21 then
      raise exception 'too_early';
    end if;
    v_key := 'summary:' || v_day;
  elsif p_kind = 'answer' then
    select * into v_q from public.msg_messages where id = p_reply;
    if v_q.id is null or v_q.author is distinct from v_me.user_id or v_q.body !~ '@클로슈' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    v_key := 'answer:' || p_reply;
  else
    raise exception 'bad_kind';
  end if;
  insert into public.msg_bot_runs (key) values (v_key) on conflict do nothing;
  if not found then
    raise exception 'exists';
  end if;
  -- 답은 물어본 사람에게만 알림, 오늘 정리는 모두에게
  -- 글은 화면이 규칙으로 만든다 — 누구 화면에서 만들었는지(by)를 서버가 남겨 클로슈 이름으로 아무 글이나 올리지 못하게 한다(Codex 검토)
  v_m := private.msg_bot_insert(p_text, jsonb_build_object('kind', p_kind, 'day', v_day, 'by', v_me.display_name)
    || case when p_kind = 'answer' then jsonb_build_object('to', jsonb_build_array(v_me.user_id)) else '{}'::jsonb end, p_reply);
  update public.msg_bot_runs set message_id = v_m.id where key = v_key;
  return to_jsonb(v_m);
end;
$$;

-- 한국 시각 표기 — '10/21 오후 3:00'
create or replace function private.msg_when(p timestamptz)
returns text language sql stable set search_path = ''
as $$
  select to_char(p at time zone 'Asia/Seoul', 'FMMM/FMDD ')
    || case when extract(hour from p at time zone 'Asia/Seoul') < 12 then '오전 ' else '오후 ' end
    || coalesce(nullif(extract(hour from p at time zone 'Asia/Seoul')::int % 12, 0), 12) || ':' || to_char(p at time zone 'Asia/Seoul', 'MI');
$$;

-- ④ 약속 지남 알림 — 화면이 1분마다 부른다. 약속 시각이 지난 대기 중 할 일마다 한 번 '@이름 … 지났어요'를 올린다.
--    돌려주는 값: 새로 올린 메시지 id 목록(화면이 휴대폰 알림을 부른다)·오늘 정리를 올릴 때인지.
create or replace function public.msg_bot_tick()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  t record;
  v_m public.msg_messages;
  v_ids bigint[] := '{}';
  v_day text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  for t in
    select k.* from public.msg_tasks k
    where k.status = '대기' and k.due_at is not null and k.due_at < now() and k.due_alerted_at is null
    order by k.due_at limit 10
    for update skip locked
  loop
    v_m := private.msg_bot_insert(
      '@' || t.assignee_name || ' 약속 시각(' || private.msg_when(t.due_at) || ')이 지났어요 — ' || left(t.text, 120)
        || case when coalesce(t.due_note, '') <> '' then ' (' || left(t.due_note, 60) || ')' else '' end,
      jsonb_build_object('kind', 'due', 'task', t.id, 'to', jsonb_build_array(t.assignee)), t.message_id);
    update public.msg_tasks set due_alerted_at = now() where id = t.id;
    v_ids := v_ids || v_m.id;
  end loop;
  -- 아직 휴대폰 알림을 못 보낸 클로슈 글(하루 안)도 돌려준다 — 만든 화면이 알림 전에 닫혀도 다음 tick 의 화면이 보낸다.
  -- msg-push 가 pushed_at 으로 한 번만 보낸다 (Codex 검토)
  v_ids := v_ids || coalesce(array(
    select m.id from public.msg_messages m
    where m.bot is not null and m.pushed_at is null and m.deleted_at is null
      and m.created_at > now() - interval '1 day' and not (m.id = any(v_ids))
    order by m.id limit 20), '{}');
  return jsonb_build_object('msgs', to_jsonb(v_ids),
    'summary', extract(hour from now() at time zone 'Asia/Seoul') >= 21 and not exists (select 1 from public.msg_bot_runs where key = 'summary:' || v_day));
end;
$$;

-- 미룸을 다시 정하면 약속 지남 알림도 다시 올릴 수 있게 비운다
create or replace function private.msg_due_reset()
returns trigger language plpgsql as $$
begin
  if new.due_at is distinct from old.due_at then new.due_alerted_at := null; end if;
  return new;
end;
$$;
drop trigger if exists msg_tasks_due_reset on public.msg_tasks;
create trigger msg_tasks_due_reset before update of due_at on public.msg_tasks
  for each row execute function private.msg_due_reset();

revoke all on function public.msg_bot_ask(bigint, text, jsonb) from public, anon;
revoke all on function public.msg_bot_pick(bigint, uuid) from public, anon;
revoke all on function public.msg_bot_post(text, text, bigint) from public, anon;
revoke all on function public.msg_bot_tick() from public, anon;
grant execute on function public.msg_bot_ask(bigint, text, jsonb) to authenticated;
grant execute on function public.msg_bot_pick(bigint, uuid) to authenticated;
grant execute on function public.msg_bot_post(text, text, bigint) to authenticated;
grant execute on function public.msg_bot_tick() to authenticated;
