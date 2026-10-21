-- 출근 센터에 '도래울센터'를 더한다 (2026-10-21 원장님 — 슈톡 리디자인 시안의 '도래울 센터', "도래울 센터 추가")
--   화면 표시 이름은 '도래울 센터'(슈톡 LOC_LBL), 저장 값은 '화정센터'처럼 붙여 쓴 '도래울센터'.
--   msg_presence_set 은 202610200004 본문 그대로, work_fix 는 202610200002 본문 그대로 — 센터 목록만 늘렸다.
--   근무표 표(work_roster·work_shifts)의 센터 제약도 같이 늘린다. 다시 실행해도 안전하다.
--   ※ 202610200004 를 다시 돌리면 msg_presence_set 이 옛 목록으로 돌아가니 그 뒤 이 파일도 다시 돌릴 것.

alter table public.work_roster drop constraint if exists work_roster_loc_check;
alter table public.work_roster add constraint work_roster_loc_check check (loc in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터'));
alter table public.work_shifts drop constraint if exists work_shifts_loc_check;
alter table public.work_shifts add constraint work_shifts_loc_check check (loc in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터'));

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
  if p_on and v_loc not in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터') then
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
  if v_loc not in ('본원', '화정센터', '민초센터', '정리정독', '도래울센터') then
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
revoke all on function public.msg_presence_set(text, boolean) from public, anon;
grant execute on function public.msg_presence_set(text, boolean) to authenticated;
revoke all on function public.work_fix(bigint, uuid, date, text, text, text, text, boolean) from public, anon;
grant execute on function public.work_fix(bigint, uuid, date, text, text, text, text, boolean) to authenticated;
