-- 슈톡 DM(쪽지) — 파일 첨부·캡처 붙여넣기 (2026-10-29 원장님 "DM에 파일첨부, 이미지 캡쳐 복사 붙이기 기능 필요")
-- msg_tasks.files jsonb — 메시지의 files 와 같은 꼴 [{path,name,size,mime}] (비공개 버킷 msg-files, 화면이 먼저 올리고 경로만 보낸다).
-- msg_note_send 에 p_files 를 더한다(두 인자 함수는 지워 이름이 겹치지 않게 — 202610290003). 검사는 msg_send 와 같다(10개·경로 모양·이름 길이).
-- 글이 비어도 파일이 있으면 보낼 수 있고 그때 할 일 글은 '파일 확인'. 다시 실행해도 안전하다.
alter table public.msg_tasks add column if not exists files jsonb not null default '[]'::jsonb;

drop function if exists public.msg_note_send(uuid[], text);
create or replace function public.msg_note_send(p_to uuid[], p_text text, p_files jsonb default '[]'::jsonb)
returns setof public.msg_tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_text text := btrim(coalesce(p_text, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_ids uuid[];
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
  if v_text = '' and jsonb_array_length(v_files) = 0 then raise exception 'empty'; end if;
  if char_length(v_text) > 300 then raise exception 'too_long'; end if;
  if v_text = '' then v_text := '파일 확인'; end if;
  select array_agg(distinct t.user_id) into v_ids
    from unnest(coalesce(p_to, '{}'::uuid[])) as u(id)
    join public.teacher_accounts t on t.user_id = u.id and t.active
   where t.user_id <> v_me.user_id;
  if v_ids is null or array_length(v_ids, 1) is null then raise exception 'no_recipient'; end if;
  return query
    insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text, files, ack_only, note, hand_push, hand_by)
    select null, t.user_id, t.display_name, v_me.user_id, v_me.display_name, v_text, v_files, true, true, t.user_id, v_me.user_id
      from public.teacher_accounts t
     where t.user_id = any(v_ids)
     order by t.display_name
    returning *;
end;
$$;
revoke all on function public.msg_note_send(uuid[], text, jsonb) from public, anon;
grant execute on function public.msg_note_send(uuid[], text, jsonb) to authenticated;
