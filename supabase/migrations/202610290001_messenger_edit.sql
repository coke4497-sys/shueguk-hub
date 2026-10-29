-- 슈톡 메시지 수정 (2026-10-29 원장님 "올린 사람이 본인의 대화는 수정할 수 있도록")
--   msg_messages.edited_at — 글을 고친 때(비어 있으면 고친 적 없음). 화면은 시각 옆에 '수정됨'으로 보여 준다.
--   msg_edit(p_id, p_body) — 글쓴이 본인만(관리자도 남의 글은 못 고침). 글만 바꾸고 첨부 파일·답장 원글·@로 부른 사람(할 일)은 그대로.
--     그 메시지의 아직 '대기'인 할 일 글은 새 글에 맞춰 다시 쓴다(msg_send 와 같은 규칙 — @이름·@모두·@조교·@선생님 뺌).
--     끝난(완료·취소) 할 일은 그때 글 그대로 둔다. 지운 글·작성자 없는 글(클로슈·카카오채널·활동 알림)은 고칠 수 없다.
--   updated_at 을 바꾸므로 다른 화면도 3초 폴링으로 고친 글을 받는다. 휴대폰 알림은 보내지 않는다.
--   202610200007(_group_mention) 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_messages add column if not exists edited_at timestamptz;

create or replace function public.msg_edit(p_id bigint, p_body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_m public.msg_messages;
  v_body text := btrim(coalesce(p_body, ''));
  v_text text;
  r record;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_m from public.msg_messages where id = p_id for update;
  if v_m.id is null then
    raise exception 'not_found';
  end if;
  -- 글쓴이 본인만 — 작성자 없는 글(클로슈·카카오채널·활동 알림)도 고칠 수 없다
  if v_m.author is null or v_m.author is distinct from v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_m.deleted_at is not null then
    raise exception 'msg_deleted';
  end if;
  if v_body = '' and jsonb_array_length(v_m.files) = 0 then
    raise exception 'empty';
  end if;
  if length(v_body) > 4000 then
    raise exception 'too_long';
  end if;

  if v_body is distinct from v_m.body then
    update public.msg_messages set body = v_body, edited_at = now(), updated_at = now()
    where id = p_id returning * into v_m;

    -- 아직 '대기'인 할 일 글을 새 글에 맞춘다 — 할 일 글 = 메시지에서 @이름(뒤의 T·선생님·쌤·조교·님 — 한 칸 띄어도 — 포함)을 뺀 것(msg_send 와 같은 규칙)
    if exists (select 1 from public.msg_tasks k where k.message_id = p_id and k.status = '대기') then
      v_text := v_body;
      for r in
        select t.display_name from public.teacher_accounts t
        where t.active and position('@' || t.display_name in v_body) > 0
        order by length(t.display_name) desc
      loop
        v_text := regexp_replace(v_text,
          '@' || regexp_replace(r.display_name, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') || '( ?(T|선생님|쌤|조교|님))?',
          '', 'g');
      end loop;
      v_text := regexp_replace(v_text, '@(모두|전체)( ?(선생님|님|에게))?', '', 'g');
      v_text := regexp_replace(v_text, '@(조교|선생님)(들)?( ?(님|에게))?', '', 'g');
      v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
      if v_text = '' then
        v_text := case when jsonb_array_length(v_m.files) > 0 then '파일 확인' else '메시지 확인' end;
      end if;
      v_text := left(v_text, 300);
      update public.msg_tasks set text = v_text, updated_at = now()
      where message_id = p_id and status = '대기' and text is distinct from v_text;
    end if;
  end if;

  return jsonb_build_object(
    'message', to_jsonb(v_m),
    'tasks', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.msg_tasks k where k.message_id = p_id), '[]'::jsonb));
end;
$$;

revoke all on function public.msg_edit(bigint, text) from public, anon;
grant execute on function public.msg_edit(bigint, text) to authenticated;

comment on function public.msg_edit(bigint, text) is '슈톡 메시지 글 고치기 — 글쓴이 본인만, 대기 중인 할 일 글도 함께(202610290001)';
