-- 조교 근무 일지 — 조기퇴근도 대표님 확인 (2026-10-20 원장님 "조기 퇴근도 확인 필요")
--   근무표 끝보다 30분 넘게 일찍 [퇴근]하면 서버가 바로 확인 요청을 만든다(창에 답하지 않고 앱을 닫아도 빠지지 않게):
--   early_status '대기' + 슈톡 '[기타요청] @박언호 조기퇴근 확인 요청 — …' 글과 박언호 대표님 업무 카드 할 일(초과근무와 같은 승인자).
--   창의 [네, 조기퇴근이에요]에 사유를 적으면 그 글·할 일에 사유를 덧붙인다(work_early(id, true, 사유)).
--   [아니요, 잘못 눌렀어요] = 퇴근 취소 — 할 일은 완료로, 글 끝에 '잘못 누른 퇴근이라 취소했습니다'.
--   대표님·원장님이 근무 일지에서 [확인]/[반려](work_early_decide) → 할 일 완료. 근무 시간은 언제나 실제 퇴근까지(확인은 기록용).
--   대표님·원장님 본인의 조기퇴근은 바로 '확인'.
-- 202610200003 다음에 적용한다. 다시 실행해도 안전하다. 0001·0003을 다시 돌리면 그 뒤 이 파일도 다시 돌릴 것.

alter table public.work_records add column if not exists early_status text not null default '';
alter table public.work_records add column if not exists early_note text not null default '';
alter table public.work_records add column if not exists early_by_name text not null default '';
alter table public.work_records add column if not exists early_at timestamptz;
alter table public.work_records add column if not exists early_task_id bigint;
do $$ begin
  alter table public.work_records add constraint work_records_early_status_check check (early_status in ('', '대기', '확인', '반려'));
exception when duplicate_object then null; end $$;
create index if not exists work_records_early_wait on public.work_records (early_status) where early_status = '대기';

-- 확인 요청 글(사유가 있으면 붙임)
create or replace function private.work_early_text(p_id bigint)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_row public.work_records; v_se timestamptz; v_min int;
begin
  select * into v_row from public.work_records where id = p_id;
  v_se := private.work_sched_end(v_row.user_id, v_row.ymd);
  v_min := greatest(0, floor(extract(epoch from (v_se - v_row.out_at)) / 60))::int;
  return '조기퇴근 확인 요청 — ' || v_row.name || ' ' || extract(month from v_row.ymd) || '/' || extract(day from v_row.ymd)
    || ' (' || (array['월','화','수','목','금','토','일'])[extract(isodow from v_row.ymd)::int] || ') ' || v_row.loc
    || ' · 퇴근 ' || to_char(v_row.out_at at time zone 'Asia/Seoul', 'HH24:MI') || '(근무표 ' || to_char(v_se at time zone 'Asia/Seoul', 'HH24:MI') || '까지, '
    || case when v_min >= 60 then (v_min / 60) || '시간' || case when v_min % 60 > 0 then ' ' || (v_min % 60) || '분' else '' end else v_min || '분' end || ' 일찍)'
    || case when v_row.early_note <> '' then ' · 사유: ' || v_row.early_note else '' end
    || '. 슈국 운영 → 조교 근무 일지에서 확인해 주세요.';
end;
$$;
revoke all on function private.work_early_text(bigint) from public;

create or replace function private.work_early_ask(p_id bigint, p_me public.teacher_accounts)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare v_row public.work_records; v_ap public.teacher_accounts := private.work_approver(); v_text text; v_msg bigint;
begin
  select * into v_row from public.work_records where id = p_id;
  if v_ap.user_id is null then return null; end if;
  perform private.work_ot_close(v_row.early_task_id, p_me.display_name);
  v_text := private.work_early_text(p_id);
  insert into public.msg_messages (author, author_name, body)
  values (p_me.user_id, p_me.display_name, '[기타요청] @' || v_ap.display_name || ' ' || v_text)
  returning id into v_msg;
  insert into public.msg_tasks (message_id, assignee, assignee_name, requester, requester_name, text)
  values (v_msg, v_ap.user_id, v_ap.display_name, p_me.user_id, p_me.display_name, left('[기타요청] ' || v_text, 300));
  update public.work_records set early_task_id = (select id from public.msg_tasks where message_id = v_msg limit 1) where id = p_id;
  return v_msg;
end;
$$;
revoke all on function private.work_early_ask(bigint, public.teacher_accounts) from public;

-- [네, 조기퇴근이에요](사유) / [아니요, 잘못 눌렀어요] — 202610200003의 두 인자 함수를 사유를 받는 세 인자로 바꾼다
drop function if exists public.work_early(bigint, boolean);
create or replace function public.work_early(p_id bigint, p_yes boolean, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.work_records;
  v_pres public.msg_presence;
  v_note text := btrim(coalesce(p_note, ''));
  v_msg bigint;
  v_ap public.teacher_accounts;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if length(v_note) > 100 then
    raise exception 'too_long';
  end if;
  select * into v_row from public.work_records where id = p_id for update;
  if v_row.id is null then
    raise exception 'not_found';
  end if;
  if v_row.user_id <> v_me.user_id and not private.work_viewer() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_row.out_at is null then
    raise exception 'not_out';
  end if;
  select message_id into v_msg from public.msg_tasks where id = v_row.early_task_id;
  if coalesce(p_yes, false) then
    update public.work_records set early_out = true, early_note = case when v_note <> '' then v_note else early_note end, updated_at = now()
    where id = p_id returning * into v_row;
    -- 사유를 적었고 아직 확인 대기면 요청 글·할 일에 반영(화면은 updated_at으로 다시 받는다)
    if v_note <> '' and v_row.early_status = '대기' and v_msg is not null then
      v_ap := private.work_approver();
      update public.msg_messages set body = '[기타요청] @' || v_ap.display_name || ' ' || private.work_early_text(p_id), updated_at = now()
      where id = v_msg and deleted_at is null;
      update public.msg_tasks set text = left('[기타요청] ' || private.work_early_text(p_id), 300), updated_at = now()
      where id = v_row.early_task_id and status = '대기';
    end if;
    return to_jsonb(v_row);
  end if;
  -- 퇴근 취소: 본인 것, 오늘, 그 뒤로 다시 출근하지 않았을 때만
  if v_row.user_id <> v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_row.ymd <> private.work_today() or exists (select 1 from public.work_records r where r.user_id = v_row.user_id and r.ymd = v_row.ymd and r.id > v_row.id) then
    raise exception 'too_late';
  end if;
  if v_row.early_status = '대기' then
    perform private.work_ot_close(v_row.early_task_id, v_me.display_name);
    update public.msg_messages set body = body || ' — 잘못 누른 퇴근이라 취소했습니다.', updated_at = now() where id = v_msg and deleted_at is null;
  end if;
  update public.work_records set out_at = null, end_at = null, early_out = false,
    early_status = '', early_note = '', early_by_name = '', early_at = null, updated_at = now() where id = p_id;
  v_row := private.work_recalc(p_id);
  delete from public.msg_presence_log where id = (
    select l.id from public.msg_presence_log l
    where l.user_id = v_row.user_id and not l.is_on and l.at >= v_row.in_at
    order by l.id desc limit 1);
  update public.msg_presence set is_on = true, changed_at = now() where user_id = v_row.user_id
  returning * into v_pres;
  return to_jsonb(v_row) || jsonb_build_object('presence', to_jsonb(v_pres));
end;
$$;
revoke all on function public.work_early(bigint, boolean, text) from public, anon;
grant execute on function public.work_early(bigint, boolean, text) to authenticated;

-- [확인]/[반려] (대표님·원장님) — 걸려 있던 업무 카드 할 일은 완료로. 근무 시간은 바꾸지 않는다.
create or replace function public.work_early_decide(p_id bigint, p_ok boolean, p_note text)
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
  if v_row.early_status <> '대기' then
    raise exception 'not_waiting';
  end if;
  update public.work_records set early_status = case when coalesce(p_ok, false) then '확인' else '반려' end,
    early_by_name = v_me.display_name, early_at = now(),
    early_note = case when btrim(coalesce(p_note, '')) <> '' then btrim(p_note) else early_note end, updated_at = now()
  where id = p_id returning * into v_row;
  perform private.work_ot_close(v_row.early_task_id, v_me.display_name);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.work_early_decide(bigint, boolean, text) from public, anon;
grant execute on function public.work_early_decide(bigint, boolean, text) to authenticated;

-- 슈톡 퇴근 — 202610200003 본문에 조기퇴근 확인 요청을 더한다(결과 work.message_id·early_status)
create or replace function public.msg_presence_set(p_loc text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_loc text := btrim(coalesce(p_loc, ''));
  v_row public.msg_presence;
  v_today date := private.work_today();
  v_rec public.work_records;
  v_ss timestamptz;
  v_se timestamptz;
  v_start timestamptz;
  v_work jsonb := null;
  v_early boolean;
  v_msg bigint := null;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  if p_on and v_loc not in ('본원', '화정센터', '민초센터', '정리정독') then
    raise exception 'bad_loc';
  end if;
  if not p_on then
    select loc into v_loc from public.msg_presence where user_id = v_me.user_id;
    v_loc := coalesce(v_loc, '');
  end if;
  insert into public.msg_presence (user_id, name, loc, is_on, changed_at)
  values (v_me.user_id, v_me.display_name, v_loc, p_on, now())
  on conflict (user_id) do update set
    name = excluded.name, loc = excluded.loc, is_on = excluded.is_on, changed_at = now()
  returning * into v_row;
  insert into public.msg_presence_log (user_id, name, loc, is_on) values (v_me.user_id, v_me.display_name, v_loc, p_on);

  if exists (select 1 from public.work_staff s where s.user_id = v_me.user_id and s.active) then
    select * into v_rec from public.work_records
      where user_id = v_me.user_id and ymd = v_today and out_at is null
      order by id desc limit 1 for update;
    if p_on then
      if v_rec.id is null then
        perform private.work_fill(v_today, v_today);
        v_ss := private.work_sched_start(v_me.user_id, v_today);
        v_start := now();
        if v_ss is not null and v_ss > v_start then
          v_start := v_ss;
        end if;
        insert into public.work_records (ymd, user_id, name, loc, in_at, start_at)
        values (v_today, v_me.user_id, v_me.display_name, v_loc, now(), v_start)
        returning * into v_rec;
        v_work := jsonb_build_object('id', v_rec.id, 'event', 'in',
          'sched', to_char(v_ss at time zone 'Asia/Seoul', 'HH24:MI'),
          'actual', to_char(v_rec.in_at at time zone 'Asia/Seoul', 'HH24:MI'),
          'start', to_char(v_start at time zone 'Asia/Seoul', 'HH24:MI'),
          'clipped', v_start > v_rec.in_at,
          'ask', v_ss is not null and v_ss - v_rec.in_at > make_interval(mins => private.work_ot_min()),
          'diff', case when v_ss is null then 0 else greatest(0, floor(extract(epoch from (v_ss - v_rec.in_at)) / 60))::int end);
      end if;
    elsif v_rec.id is not null then
      v_se := private.work_sched_end(v_me.user_id, v_today);
      update public.work_records set out_at = now(), early_out = false, updated_at = now() where id = v_rec.id;
      v_rec := private.work_recalc(v_rec.id);
      -- 조기퇴근(근무표 끝보다 30분 넘게 일찍)은 대표님 확인 — 조교면 확인 요청 글·할 일, 대표님·원장님이면 바로 확인
      v_early := v_se is not null and v_se - v_rec.out_at > make_interval(mins => private.work_ot_min());
      if v_early then
        update public.work_records set early_status = case when private.work_viewer() then '확인' else '대기' end,
          early_note = '', early_by_name = case when private.work_viewer() then v_me.display_name else '' end, early_at = now()
        where id = v_rec.id;
        if not private.work_viewer() then v_msg := private.work_early_ask(v_rec.id, v_me); end if;
      else
        perform private.work_ot_close(v_rec.early_task_id, v_me.display_name);
        update public.work_records set early_status = '', early_note = '', early_by_name = '', early_at = null where id = v_rec.id;
      end if;
      select * into v_rec from public.work_records where id = v_rec.id;
      v_work := jsonb_build_object('id', v_rec.id, 'event', 'out', 'message_id', v_msg, 'early_status', v_rec.early_status,
        'start', to_char(v_rec.start_at at time zone 'Asia/Seoul', 'HH24:MI'),
        'sched', to_char(v_se at time zone 'Asia/Seoul', 'HH24:MI'),
        'actual', to_char(v_rec.out_at at time zone 'Asia/Seoul', 'HH24:MI'),
        'end', to_char(v_rec.end_at at time zone 'Asia/Seoul', 'HH24:MI'),
        'ask', v_se is not null and v_rec.out_at - v_se > make_interval(mins => private.work_ot_min()),
        'diff', case when v_se is null then 0 else greatest(0, floor(extract(epoch from (v_rec.out_at - v_se)) / 60))::int end,
        'minutes', private.work_minutes(v_rec.start_at, v_rec.end_at),
        'early', v_se is not null and v_se - v_rec.out_at > make_interval(mins => private.work_ot_min()),
        'early_diff', case when v_se is null then 0 else greatest(0, floor(extract(epoch from (v_se - v_rec.out_at)) / 60))::int end);
    end if;
  end if;
  return to_jsonb(v_row) || jsonb_build_object('work', v_work);
end;
$$;
revoke all on function public.msg_presence_set(text, boolean) from public, anon;
grant execute on function public.msg_presence_set(text, boolean) to authenticated;
