-- 슈톡 ← 카카오톡 채널 문의 (2026-10-20 원장님 "슈톡에 카카오채널 메시지를 연결할 수 있어요?" → "1번 챗봇 방식으로 진행")
-- 카카오 i 오픈빌더 챗봇의 스킬 서버(엣지 함수 kakao-skill)가 학부모님이 채널에 보낸 글을 받아 이 함수로 슈톡에 올린다.
--   · 메시지: author 없이 author_name '카카오채널', bot {kind:'kakao', who:보낸 사람 구분(6자), to:관리자들}
--   · 업무 카드: 활성 관리자(원장님)마다 '카카오채널 문의 확인' 할 일 — 답을 마치면 체크
--   · 답장은 카카오채널 관리자센터에서 한다(슈톡에서 채널로 보내지는 않음)
-- service_role 만 실행. 같은 사람은 하루 30개까지(장난 글로 업무 카드가 넘치지 않게).
create or replace function public.kakao_inbound(p_who text, p_text text)
returns public.msg_messages
language plpgsql security definer set search_path = ''
as $$
declare
  v_who text := left(coalesce(nullif(btrim(p_who), ''), '------'), 12);
  v_text text := left(coalesce(nullif(btrim(p_text), ''), '(글 없이 보낸 메시지)'), 2000);
  v_to uuid[];
  v_m public.msg_messages;
begin
  if (select count(*) from public.msg_messages m
      where m.bot->>'kind' = 'kakao' and m.bot->>'who' = v_who and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many';
  end if;
  select array_agg(t.user_id order by t.display_name) into v_to
    from public.teacher_accounts t where t.active and t.role = 'admin';
  insert into public.msg_messages (author, author_name, body, files, reply_to, bot)
  values (null, '카카오채널', '학부모님 문의 (#' || v_who || ')' || chr(10) || v_text, '[]'::jsonb, null,
          jsonb_build_object('kind', 'kakao', 'who', v_who) || case when v_to is null then '{}'::jsonb else jsonb_build_object('to', to_jsonb(v_to)) end)
  returning * into v_m;
  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text)
  select v_m.id, t.user_id, t.display_name, null, '카카오채널', left('카카오채널 문의 확인 (#' || v_who || ') — ' || v_text, 300)
    from public.teacher_accounts t where t.active and t.role = 'admin';
  return v_m;
end;
$$;
revoke all on function public.kakao_inbound(text, text) from public, anon, authenticated;
grant execute on function public.kakao_inbound(text, text) to service_role;
