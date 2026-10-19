-- 슈국 대화방 휴대폰 푸시 알림 (2026-10-19 원장님 "푸시 알림이 꼭 떠야 해요")
--   msg_push_subs : 기기마다 한 줄 — 웹 푸시 구독(endpoint·키)과 받을 범위(all 모든 메시지 / mention 나를 부른 것만)
--   msg_messages.pushed_at : 이 메시지 알림을 이미 보냈는지 — 알림 함수(msg-push)가 한 번만 보내도록 잡는 자리
-- 보내기는 엣지 함수 supabase/functions/msg-push 가 서비스 키로 한다(VAPID 비밀 키는 함수 비밀값에만).
-- 202610190001_messenger.sql 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.msg_messages add column if not exists pushed_at timestamptz;

create table if not exists public.msg_push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  mode text not null default 'all' check (mode in ('all', 'mention')),
  ua text not null default '' check (length(ua) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
create index if not exists msg_push_subs_user on public.msg_push_subs (user_id);

alter table public.msg_push_subs enable row level security;
revoke all on table public.msg_push_subs from anon, authenticated;
-- 표는 아무도 직접 읽거나 쓰지 않는다 — 아래 함수와 서비스 키(엣지 함수)만

-- 이 기기 구독 저장(같은 endpoint면 주인·키·범위를 새로 씀)
create or replace function public.msg_push_save(p_sub jsonb, p_mode text default 'all', p_ua text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_ep text := coalesce(p_sub->>'endpoint', '');
  v_p text := coalesce(p_sub#>>'{keys,p256dh}', '');
  v_a text := coalesce(p_sub#>>'{keys,auth}', '');
  v_mode text := case when p_mode = 'mention' then 'mention' else 'all' end;
  v_row public.msg_push_subs;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if v_ep !~ '^https://' or length(v_ep) > 1000 or length(v_p) not between 20 and 200 or length(v_a) not between 8 and 100 then
    raise exception 'bad_sub';
  end if;
  insert into public.msg_push_subs (user_id, endpoint, p256dh, auth, mode, ua)
  values (v_me.user_id, v_ep, v_p, v_a, v_mode, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    mode = excluded.mode, ua = excluded.ua, updated_at = now(), fail_count = 0
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'mode', v_row.mode);
end;
$$;

-- 이 기기 알림 끄기 (자기 구독만)
create or replace function public.msg_push_remove(p_endpoint text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_n int;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  delete from public.msg_push_subs where endpoint = p_endpoint and user_id = v_me.user_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n);
end;
$$;

-- 이 기기 구독이 저장돼 있는지·범위 (화면 표시용)
create or replace function public.msg_push_state(p_endpoint text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.msg_push_subs;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_row from public.msg_push_subs where endpoint = p_endpoint and user_id = v_me.user_id;
  return jsonb_build_object(
    'saved', v_row.id is not null,
    'mode', coalesce(v_row.mode, 'all'),
    'devices', (select count(*) from public.msg_push_subs s where s.user_id = v_me.user_id));
end;
$$;

revoke all on function public.msg_push_save(jsonb, text, text) from public, anon;
revoke all on function public.msg_push_remove(text) from public, anon;
revoke all on function public.msg_push_state(text) from public, anon;
grant execute on function public.msg_push_save(jsonb, text, text) to authenticated;
grant execute on function public.msg_push_remove(text) to authenticated;
grant execute on function public.msg_push_state(text) to authenticated;

comment on table public.msg_push_subs is '슈국 대화방 휴대폰 알림 구독 — 기기마다 한 줄, 엣지 함수 msg-push가 읽어 보낸다';
