-- 조교 근무 일지 — 초과근무 승인 (2026-10-20 원장님 "승인 과정 필요. 박언호 대표님 업무 리스트로 넣어줘", 시급은 같은 시급)
--   조교가 '초과근무인가요?'에 [네](또는 [초과근무 신청]·시각 고치기의 초과근무 체크)를 누르면 승인 대기(ot_status '대기')가 되고,
--   슈톡에 '[기타요청] 초과근무 승인 요청 @박언호 …' 글이 올라가 박언호 대표님(parkeh, 없으면 원장님) 업무 카드에 할 일이 생긴다.
--   승인 전에는 근무표 시각까지만 센다. 대표님·원장님이 근무 일지에서 [승인]하면 누른 시각 그대로 세고 그 할 일은 완료,
--   [반려]하면 근무표 시각 그대로. 대표님·원장님이 직접 초과근무로 정하면 바로 승인.
-- 202610200001 다음에 적용한다. 다시 실행해도 안전하다.

alter table public.work_records add column if not exists ot_status text not null default '';
alter table public.work_records add column if not exists ot_task_id bigint;
alter table public.work_records add column if not exists ot_note text not null default '';
alter table public.work_records add column if not exists ot_by_name text not null default '';
alter table public.work_records add column if not exists ot_at timestamptz;
do $$ begin
  alter table public.work_records add constraint work_records_ot_status_check check (ot_status in ('', '대기', '승인', '반려'));
exception when duplicate_object then null; end $$;
create index if not exists work_records_ot_wait on public.work_records (ot_status) where ot_status = '대기';

-- 승인하는 사람: 박언호 대표님(parkeh), 계정이 없거나 쉬면 원장님(admin)
create or replace function private.work_approver()
returns public.teacher_accounts
language sql stable security definer set search_path = ''
as $$
  select t.* from public.teacher_accounts t
  where t.active and (t.login_id = 'parkeh' or t.role = 'admin')
  order by (t.login_id = 'parkeh') desc, t.display_name
  limit 1;
$$;
revoke all on function private.work_approver() from public;

-- 근무 시작·끝을 플래그와 승인 상태로 다시 계산한다(승인된 초과근무만 누른 시각 그대로)
create or replace function private.work_recalc(p_id bigint)
returns public.work_records
language plpgsql security definer set search_path = ''
as $$
declare v_row public.work_records; v_ss timestamptz; v_se timestamptz; v_start timestamptz; v_end timestamptz;
begin
  select * into v_row from public.work_records where id = p_id;
  v_ss := private.work_sched_start(v_row.user_id, v_row.ymd);
  v_se := private.work_sched_end(v_row.user_id, v_row.ymd);
  v_start := case when v_ss is null or (v_row.ot_start and v_row.ot_status = '승인') then v_row.in_at else greatest(v_row.in_at, v_ss) end;
  v_end := case when v_row.out_at is null then null
                when v_se is null or (v_row.ot_end and v_row.ot_status = '승인') then v_row.out_at
                else greatest(least(v_row.out_at, v_se), v_start) end;
  update public.work_records set start_at = v_start, end_at = v_end, updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;
revoke all on function private.work_recalc(bigint) from public;

-- 걸려 있는 승인 요청 할 일을 완료로(승인·반려·취소 때)
create or replace function private.work_ot_close(p_task bigint, p_by text)
returns void
language sql security definer set search_path = ''
as $$
  update public.msg_tasks set status = '완료', done_by_name = p_by, done_at = now(), seen_at = coalesce(seen_at, now()), updated_at = now()
  where id = p_task and status = '대기';
$$;
revoke all on function private.work_ot_close(bigint, text) from public;

-- 슈톡에 승인 요청 글 + 대표님 할 일 — 메시지 id를 돌려준다(화면이 휴대폰 알림을 부른다)
create or replace function private.work_ot_ask(p_id bigint, p_me public.teacher_accounts)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.work_records;
  v_ap public.teacher_accounts := private.work_approver();
  v_ss timestamptz; v_se timestamptz;
  v_part text := ''; v_who text; v_text text; v_msg bigint; v_min int;
begin
  select * into v_row from public.work_records where id = p_id;
  if v_ap.user_id is null then return null; end if;
  v_ss := private.work_sched_start(v_row.user_id, v_row.ymd);
  v_se := private.work_sched_end(v_row.user_id, v_row.ymd);
  if v_row.ot_start and v_ss is not null and v_row.in_at < v_ss then
    v_min := floor(extract(epoch from (v_ss - v_row.in_at)) / 60);
    v_part := v_part || ' · 출근 ' || to_char(v_row.in_at at time zone 'Asia/Seoul', 'HH24:MI') || '(근무표 ' || to_char(v_ss at time zone 'Asia/Seoul', 'HH24:MI') || '부터, ' || v_min || '분)';
  end if;
  if v_row.ot_end and v_se is not null and v_row.out_at > v_se then
    v_min := floor(extract(epoch from (v_row.out_at - v_se)) / 60);
    v_part := v_part || ' · 퇴근 ' || to_char(v_row.out_at at time zone 'Asia/Seoul', 'HH24:MI') || '(근무표 ' || to_char(v_se at time zone 'Asia/Seoul', 'HH24:MI') || '까지, ' || v_min || '분)';
  end if;
  v_who := v_row.name || ' ' || extract(month from v_row.ymd) || '/' || extract(day from v_row.ymd)
        || ' (' || (array['월','화','수','목','금','토','일'])[extract(isodow from v_row.ymd)::int] || ') ' || v_row.loc;
  v_text := '초과근무 승인 요청 — ' || v_who || v_part || '. 슈국 운영 → 조교 근무 일지에서 승인해 주세요.';
  perform private.work_ot_close(v_row.ot_task_id, p_me.display_name);
  insert into public.msg_messages (author, author_name, body)
  values (p_me.user_id, p_me.display_name, '[기타요청] @' || v_ap.display_name || ' ' || v_text)
  returning id into v_msg;
  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text)
  values (v_msg, v_ap.user_id, v_ap.display_name, p_me.user_id, p_me.display_name, left('[기타요청] ' || v_text, 300));
  update public.work_records set ot_task_id = (select id from public.msg_tasks where message_id = v_msg limit 1) where id = p_id;
  return v_msg;
end;
$$;
revoke all on function private.work_ot_ask(bigint, public.teacher_accounts) from public;

-- 초과근무인가요? — p_kind 'in'(이른 출근)·'out'(늦은 퇴근), p_yes [네]/[아니요]. 본인 또는 대표님·원장님.
--   조교의 [네] = 승인 요청(대표님 할 일), 대표님·원장님의 [네] = 바로 승인. [아니요] = 그 쪽 초과근무를 거둔다.
create or replace function public.work_overtime(p_id bigint, p_kind text, p_yes boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_view boolean := private.work_viewer();
  v_row public.work_records;
  v_msg bigint := null;
  v_yes boolean := coalesce(p_yes, false);
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  select * into v_row from public.work_records where id = p_id for update;
  if v_row.id is null then
    raise exception 'not_found';
  end if;
  if v_row.user_id <> v_me.user_id and not v_view then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'bad_kind';
  end if;
  if p_kind = 'out' and v_row.out_at is null then
    raise exception 'not_out';
  end if;
  update public.work_records set
    ot_start = case when p_kind = 'in' then v_yes else ot_start end,
    ot_end = case when p_kind = 'out' then v_yes else ot_end end
  where id = p_id returning * into v_row;
  if not (v_row.ot_start or v_row.ot_end) then
    perform private.work_ot_close(v_row.ot_task_id, v_me.display_name);
    update public.work_records set ot_status = '', ot_note = '', ot_by_name = '', ot_at = null where id = p_id;
  elsif v_yes and v_view then
    perform private.work_ot_close(v_row.ot_task_id, v_me.display_name);
    update public.work_records set ot_status = '승인', ot_note = '', ot_by_name = v_me.display_name, ot_at = now() where id = p_id;
  elsif v_yes then
    update public.work_records set ot_status = '대기', ot_note = '', ot_by_name = '', ot_at = now() where id = p_id;
    v_msg := private.work_ot_ask(p_id, v_me);
  end if;
  v_row := private.work_recalc(p_id);
  return to_jsonb(v_row) || jsonb_build_object('minutes', private.work_minutes(v_row.start_at, v_row.end_at), 'message_id', v_msg);
end;
$$;

-- 승인·반려 (대표님·원장님) — 걸려 있던 업무 카드 할 일은 완료로
create or replace function public.work_ot_decide(p_id bigint, p_ok boolean, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.work_records;
begin
  if v_me.user_id is null or not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(coalesce(p_note, '')) > 100 then
    raise exception 'too_long';
  end if;
  select * into v_row from public.work_records where id = p_id for update;
  if v_row.id is null then
    raise exception 'not_found';
  end if;
  if v_row.ot_status <> '대기' then
    raise exception 'not_waiting';
  end if;
  update public.work_records set
    ot_status = case when coalesce(p_ok, false) then '승인' else '반려' end,
    ot_start = case when coalesce(p_ok, false) then ot_start else false end,
    ot_end = case when coalesce(p_ok, false) then ot_end else false end,
    ot_note = btrim(coalesce(p_note, '')), ot_by_name = v_me.display_name, ot_at = now()
  where id = p_id;
  perform private.work_ot_close(v_row.ot_task_id, v_me.display_name);
  v_row := private.work_recalc(p_id);
  return to_jsonb(v_row) || jsonb_build_object('minutes', private.work_minutes(v_row.start_at, v_row.end_at));
end;
$$;

-- 근무 시각 고치기 — 초과근무 체크(p_ot)는 조교면 승인 요청, 대표님·원장님이면 바로 승인
create or replace function public.work_fix(p_id bigint, p_user uuid, p_ymd date, p_loc text, p_in text, p_out text, p_reason text, p_ot boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_view boolean := private.work_viewer();
  v_row public.work_records;
  v_user uuid; v_ymd date; v_in timestamptz; v_out timestamptz; v_ss timestamptz; v_se timestamptz;
  v_ot boolean := coalesce(p_ot, false);
  v_os boolean; v_oe boolean; v_status text; v_msg bigint := null;
  v_name text;
  v_loc text := btrim(coalesce(p_loc, ''));
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'need_reason';
  end if;
  if length(p_reason) > 100 then
    raise exception 'too_long';
  end if;
  if coalesce(p_in, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_out, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad_time';
  end if;
  if p_id is not null then
    select * into v_row from public.work_records where id = p_id for update;
    if v_row.id is null then
      raise exception 'not_found';
    end if;
    v_user := v_row.user_id; v_ymd := v_row.ymd;
    if v_loc = '' then v_loc := v_row.loc; end if;
  else
    v_user := p_user; v_ymd := p_ymd;
    if v_user is null or v_ymd is null then
      raise exception 'bad_args';
    end if;
    if not exists (select 1 from public.work_staff s where s.user_id = v_user) then
      raise exception 'bad_user';
    end if;
  end if;
  if v_user <> v_me.user_id and not v_view then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_ymd > private.work_today() then
    raise exception 'future';
  end if;
  if v_loc not in ('본원', '화정센터', '민초센터', '정리정독') then
    raise exception 'bad_loc';
  end if;
  v_in := (v_ymd + p_in::time) at time zone 'Asia/Seoul';
  v_out := (v_ymd + p_out::time) at time zone 'Asia/Seoul';
  if v_out <= v_in then
    raise exception 'bad_order';
  end if;
  v_ss := private.work_sched_start(v_user, v_ymd);
  v_se := private.work_sched_end(v_user, v_ymd);
  v_os := v_ot and v_ss is not null and v_in < v_ss;
  v_oe := v_ot and v_se is not null and v_out > v_se;
  v_status := case when not (v_os or v_oe) then '' when v_view then '승인' else '대기' end;
  if v_row.id is not null then
    if v_status <> '대기' then perform private.work_ot_close(v_row.ot_task_id, v_me.display_name); end if;
    update public.work_records set loc = v_loc, in_at = v_in, out_at = v_out, ot_start = v_os, ot_end = v_oe,
      ot_status = v_status, ot_note = '', ot_by_name = case when v_status = '승인' then v_me.display_name else '' end,
      ot_at = case when v_status = '' then null else now() end,
      orig_in_at = case when fixed then orig_in_at else in_at end,
      orig_out_at = case when fixed then orig_out_at else out_at end,
      fixed = true, fix_reason = btrim(p_reason), fixed_by_name = v_me.display_name, fixed_at = now(), updated_at = now()
    where id = v_row.id returning * into v_row;
  else
    select display_name into v_name from public.teacher_accounts where user_id = v_user;
    insert into public.work_records (ymd, user_id, name, loc, in_at, start_at, out_at, end_at, ot_start, ot_end, ot_status, ot_by_name, ot_at, fixed, fix_reason, fixed_by_name, fixed_at)
    values (v_ymd, v_user, coalesce(v_name, ''), v_loc, v_in, v_in, v_out, v_out, v_os, v_oe, v_status,
      case when v_status = '승인' then v_me.display_name else '' end, case when v_status = '' then null else now() end,
      true, btrim(p_reason), v_me.display_name, now())
    returning * into v_row;
  end if;
  v_row := private.work_recalc(v_row.id);
  if v_row.end_at <= v_row.start_at and v_status = '' then
    raise exception 'bad_order';
  end if;
  if v_status = '대기' then
    v_msg := private.work_ot_ask(v_row.id, v_me);
    select * into v_row from public.work_records where id = v_row.id;
  end if;
  return to_jsonb(v_row) || jsonb_build_object('message_id', v_msg);
end;
$$;

revoke all on function public.work_overtime(bigint, text, boolean) from public, anon;
revoke all on function public.work_ot_decide(bigint, boolean, text) from public, anon;
revoke all on function public.work_fix(bigint, uuid, date, text, text, text, text, boolean) from public, anon;
grant execute on function public.work_overtime(bigint, text, boolean) to authenticated;
grant execute on function public.work_ot_decide(bigint, boolean, text) to authenticated;
grant execute on function public.work_fix(bigint, uuid, date, text, text, text, text, boolean) to authenticated;

comment on column public.work_records.ot_status is '초과근무 승인 — 빈 값(없음)·대기·승인·반려. 승인된 것만 누른 시각 그대로 센다';
