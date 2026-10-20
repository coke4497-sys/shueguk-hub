-- 슈톡 클로슈 = 진짜 클로드 (2026-10-20 원장님 "슈톡 클로슈도 진짜 클로드가 답해야해. 클로슈는 구성원처럼 실시간으로 답할 필요는 없고
-- 몇분마다 이 대화를 읽고 업무 배정이나 진행에 부족한 부분이 있을 때만 알려주고 진행하도록 도와주면 돼. 클로슈를 태그해 질문하면 깨어나 답해주고")
-- 원장님 선택: 수정 요청함처럼 클로드 세션 · 버튼·알림은 남기고 글은 클로드가 · 하루 종일.
--
-- 202610200007(규칙형)에서 바뀌는 것
--   · 화면이 글을 만들어 올리던 함수 msg_bot_ask·msg_bot_post 를 지운다 — 이제 교사 화면은 클로슈 이름으로 글을 쓸 수 없다.
--   · 클로슈 글은 엣지 함수 clochu(클로드 세션 전용 비밀값 CLOCHU_TOKEN)만 msg_bot_say 로 올린다 — service_role 만 실행.
--   · 남는 것: 배정 질문 보기 버튼(msg_bot_pick), 약속 지남 알림(msg_bot_tick — 규칙), 못 보낸 클로슈 알림 다시 보내기.
-- 다시 돌려도 된다. 202610200007 을 다시 돌리면 지운 두 함수가 되살아나니 그 뒤 이 파일도 다시 돌릴 것.

drop function if exists public.msg_bot_ask(bigint, text, jsonb);
drop function if exists public.msg_bot_post(text, text, bigint);

-- 클로슈 글 올리기 — 엣지 함수 clochu 만 부른다(service_role).
--   p_kind  : 'note'(업무 배정·진행 알림) | 'answer'(@클로슈 질문 답 — p_reply 필수) | 'ask'(배정 질문 — p_reply·p_options 필수) | 'summary'(오늘 정리)
--   p_to    : 휴대폰 알림 받을 사람(비우면 모두). ask 는 비우면 원글 쓴 사람 + 보기 선생님.
--   p_options: ask 보기 [{label, uid}] (활성 교사, 1~8개) — 고르면 msg_bot_pick 이 그 선생님께 확인 요청을 만든다.
--   p_key   : 한 번만 올릴 열쇠(예: 'answer:123', 'summary:2026-10-20', 'note:123') — 이미 있으면 'exists'.
create or replace function public.msg_bot_say(p_kind text, p_text text, p_reply bigint default null,
  p_to uuid[] default null, p_options jsonb default null, p_key text default null)
returns public.msg_messages
language plpgsql security definer set search_path = ''
as $$
declare
  v_src public.msg_messages;
  v_m public.msg_messages;
  v_opts jsonb := '[]'::jsonb;
  v_to uuid[] := p_to;
  v_bot jsonb;
  o jsonb;
begin
  if p_kind is null or p_kind not in ('note', 'answer', 'ask', 'summary') then
    raise exception 'bad_kind';
  end if;
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'empty';
  end if;
  if p_kind in ('answer', 'ask') and p_reply is null then
    raise exception 'need_reply';
  end if;
  if p_reply is not null then
    -- 원글을 잠근다 — 지우는 중(msg_delete)에 끼어들지 않게
    select * into v_src from public.msg_messages where id = p_reply for update;
    if v_src.id is null or v_src.deleted_at is not null then
      raise exception 'msg_deleted';
    end if;
  end if;
  if v_to is not null and exists (select 1 from unnest(v_to) u
      where not exists (select 1 from public.teacher_accounts t where t.user_id = u and t.active)) then
    raise exception 'bad_person';
  end if;
  if p_kind = 'ask' then
    if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) not between 1 and 8 then
      raise exception 'bad_options';
    end if;
    for o in select * from jsonb_array_elements(p_options) loop
      if coalesce(btrim(o->>'label'), '') = '' or not exists (select 1 from public.teacher_accounts t
          where t.active and t.user_id::text = o->>'uid') then
        raise exception 'bad_options';
      end if;
      v_opts := v_opts || jsonb_build_array(jsonb_build_object('label', left(btrim(o->>'label'), 80), 'uid', o->>'uid'));
    end loop;
    if v_to is null then
      select array_agg(distinct x) into v_to from (
        select (e->>'uid')::uuid as x from jsonb_array_elements(v_opts) e
        union select v_src.author where v_src.author is not null) z;
    end if;
  end if;
  if p_key is not null then
    -- 그 열쇠로 올린 글을 지웠으면 열쇠도 다시 쓸 수 있다 — 지운 답 때문에 질문이 영영 막히지 않게 (Codex 검토)
    delete from public.msg_bot_runs r where r.key = left(p_key, 120)
      and exists (select 1 from public.msg_messages m where m.id = r.message_id and m.deleted_at is not null);
    insert into public.msg_bot_runs (key) values (left(p_key, 120)) on conflict (key) do nothing;
    if not found then
      raise exception 'exists';
    end if;
  end if;
  v_bot := jsonb_build_object('kind', p_kind, 'ai', true);
  if v_to is not null then v_bot := v_bot || jsonb_build_object('to', to_jsonb(v_to)); end if;
  if p_kind = 'ask' then v_bot := v_bot || jsonb_build_object('for', p_reply, 'options', v_opts); end if;
  v_m := private.msg_bot_insert(left(p_text, 3900), v_bot, p_reply);
  if p_key is not null then
    update public.msg_bot_runs set message_id = v_m.id where key = left(p_key, 120);
  end if;
  return v_m;
end;
$$;
revoke all on function public.msg_bot_say(text, text, bigint, uuid[], jsonb, text) from public, anon, authenticated;
grant execute on function public.msg_bot_say(text, text, bigint, uuid[], jsonb, text) to service_role;

-- 엣지 함수 clochu 는 읽은 곳(열쇠 'clochu:cursor')을 이 표에 적는다 — service_role 만(교사·공개 키는 그대로 못 읽음)
grant select, insert, update on table public.msg_bot_runs to service_role;

-- 답 안 한 @클로슈 질문 — 진짜 답(bot.kind='answer', 안 지움)이 없는 것만, 오래된 순. 개수 제한은 거른 뒤에 건다 (Codex 검토)
create or replace function public.msg_bot_unanswered(p_limit int default 50)
returns setof public.msg_messages
language sql stable security definer set search_path = ''
as $$
  select m.* from public.msg_messages m
  where m.body like '%@클로슈%' and m.bot is null and m.deleted_at is null
    and not exists (select 1 from public.msg_messages a
                    where a.reply_to = m.id and a.deleted_at is null and a.bot->>'kind' = 'answer')
  order by m.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.msg_bot_unanswered(int) from public, anon, authenticated;
grant execute on function public.msg_bot_unanswered(int) to service_role;
