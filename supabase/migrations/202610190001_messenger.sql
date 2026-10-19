-- 슈국 대화방(messenger.html) — 선생님·조교·원장·대표가 한 대화방에서 이야기하고,
-- 메시지에 @이름을 넣으면 그 사람의 할 일(체크리스트)이 된다. (2026-10-19 원장님 결정)
--   msg_messages : 대화 한 줄 (글·첨부 파일 목록)
--   msg_tasks    : @로 맡긴 할 일 — 사람마다 한 줄, 대기 → 완료
--   msg-files    : 첨부 파일 비공개 버킷 (활성 교사만)
-- 읽기는 활성 교사(teacher_accounts — 허브 개인 로그인)만. 쓰기는 아래 함수로만 한다
-- (작성자·이름을 서버가 정하므로 다른 사람 이름으로 쓸 수 없다).
-- 공용 교사 계정(teachers@shueguk.internal)은 teacher_accounts에 없어 쓸 수 없다 — 의도한 것.
-- 다시 실행해도 안전하다.

create table if not exists public.msg_messages (
  id bigint generated always as identity primary key,
  author uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null default '' check (length(body) <= 4000),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists msg_messages_updated on public.msg_messages (updated_at);

create table if not exists public.msg_tasks (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.msg_messages(id) on delete cascade,
  assignee uuid references auth.users(id) on delete set null,
  assignee_name text not null,
  requester uuid references auth.users(id) on delete set null,
  requester_name text not null,
  text text not null check (length(text) <= 300),
  status text not null default '대기' check (status in ('대기', '완료')),
  done_by_name text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists msg_tasks_status on public.msg_tasks (status, assignee);
create index if not exists msg_tasks_updated on public.msg_tasks (updated_at);
create index if not exists msg_tasks_message on public.msg_tasks (message_id);

alter table public.msg_messages enable row level security;
alter table public.msg_tasks enable row level security;
revoke all on table public.msg_messages, public.msg_tasks from anon, authenticated;
grant select on table public.msg_messages, public.msg_tasks to authenticated;

drop policy if exists msg_messages_read on public.msg_messages;
create policy msg_messages_read on public.msg_messages
  for select to authenticated using ((select private.is_active_teacher()));
drop policy if exists msg_tasks_read on public.msg_tasks;
create policy msg_tasks_read on public.msg_tasks
  for select to authenticated using ((select private.is_active_teacher()));

-- 지금 로그인한 활성 교사 (없으면 null)
create or replace function private.msg_me()
returns public.teacher_accounts
language sql stable security definer set search_path = ''
as $$
  select t.* from public.teacher_accounts t
  where t.user_id = (select auth.uid()) and t.active
  limit 1;
$$;
revoke all on function private.msg_me() from public;

-- 대화방 사람 목록 (teacher_accounts는 자기 줄만 읽히므로 이름·역할만 따로 내보낸다)
create or replace function public.msg_members()
returns table (user_id uuid, name text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (private.msg_me()).user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  return query
    select t.user_id, t.display_name, t.role
    from public.teacher_accounts t
    where t.active
    order by t.display_name;
end;
$$;

-- 메시지 보내기 + @로 부른 사람마다 할 일 한 줄
create or replace function public.msg_send(p_body text, p_files jsonb default '[]'::jsonb, p_mentions uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_body text := btrim(coalesce(p_body, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_text text;
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

  insert into public.msg_messages (author, author_name, body, files)
  values (v_me.user_id, v_me.display_name, v_body, v_files)
  returning id into v_id;

  -- 할 일 글 = 메시지에서 @이름(뒤의 T·선생님·쌤·조교·님 — 한 칸 띄어도 — 포함)을 뺀 것
  v_text := v_body;
  for r in
    select t.display_name from public.teacher_accounts t
    where t.active and t.user_id = any (coalesce(p_mentions, '{}'::uuid[]))
    order by length(t.display_name) desc
  loop
    v_text := regexp_replace(v_text,
      '@' || regexp_replace(r.display_name, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') || '( ?(T|선생님|쌤|조교|님))?',
      '', 'g');
  end loop;
  v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
  if v_text = '' then
    v_text := case when jsonb_array_length(v_files) > 0 then '파일 확인' else '메시지 확인' end;
  end if;
  v_text := left(v_text, 300);

  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text)
  select v_id, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text
  from public.teacher_accounts t
  where t.active and t.user_id = any (coalesce(p_mentions, '{}'::uuid[]))
  order by t.display_name;

  return (
    select jsonb_build_object(
      'message', to_jsonb(m),
      'tasks', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.msg_tasks k where k.message_id = v_id), '[]'::jsonb))
    from public.msg_messages m where m.id = v_id
  );
end;
$$;

-- 할 일 체크/해제 — 맡은 사람·맡긴 사람·관리자만
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
    updated_at = now()
  where id = p_id
  returning * into v_t;
  return to_jsonb(v_t);
end;
$$;

-- 내 메시지 지우기(관리자는 누구 것이든) — 글·파일 목록을 비우고 그 메시지의 할 일도 지운다.
-- 저장소의 파일은 화면이 먼저 지운다.
create or replace function public.msg_delete(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_m public.msg_messages;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_m from public.msg_messages where id = p_id for update;
  if v_m.id is null then
    raise exception 'not_found';
  end if;
  if v_m.author is distinct from v_me.user_id and v_me.role <> 'admin' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.msg_tasks where message_id = p_id;
  update public.msg_messages set body = '', files = '[]'::jsonb, deleted_at = now(), updated_at = now()
  where id = p_id
  returning * into v_m;
  return to_jsonb(v_m);
end;
$$;

revoke all on function public.msg_members() from public, anon;
revoke all on function public.msg_send(text, jsonb, uuid[]) from public, anon;
revoke all on function public.msg_task_set(bigint, boolean) from public, anon;
revoke all on function public.msg_delete(bigint) from public, anon;
grant execute on function public.msg_members() to authenticated;
grant execute on function public.msg_send(text, jsonb, uuid[]) to authenticated;
grant execute on function public.msg_task_set(bigint, boolean) to authenticated;
grant execute on function public.msg_delete(bigint) to authenticated;

-- 첨부 파일 버킷 (파일당 20MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('msg-files', 'msg-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "active teachers msg files" on storage.objects;
create policy "active teachers msg files"
on storage.objects
as permissive
for all
to authenticated
using (bucket_id = 'msg-files' and (select private.is_active_teacher()))
with check (bucket_id = 'msg-files' and (select private.is_active_teacher()));

comment on table public.msg_messages is '슈국 대화방 메시지 — 쓰기는 msg_send/msg_delete 함수로만';
comment on table public.msg_tasks is '슈국 대화방 할 일 — 메시지의 @이름마다 한 줄, msg_task_set으로 체크';
