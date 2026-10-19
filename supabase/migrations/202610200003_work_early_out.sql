-- 조교 근무 일지 — 조기퇴근 질문 (2026-10-20 원장님 "조기퇴근인가요? 버튼 추가")
--   근무표 끝보다 30분(work_ot_min) 넘게 일찍 [퇴근]하면 슈톡이 '조기퇴근인가요?'를 묻는다.
--   [네, 조기퇴근이에요] → work_early(id, true): early_out = true(본인이 조기퇴근이라고 확인 — 근무 일지에 표시)
--   [아니요, 잘못 눌렀어요] → work_early(id, false): 오늘 그 퇴근을 없던 일로 — 기록을 다시 열고(out_at·end_at 비움),
--      슈톡 출근 상태도 되돌린다(msg_presence ON, 방금 남긴 퇴근 기록 줄을 지움 — 출근 현황의 출근 시각이 그대로 남게).
--   근무 시간은 언제나 실제 퇴근 시각까지(조기퇴근은 늘리지도 줄이지도 않는다).
-- 202610200002 다음에 적용한다. 다시 실행해도 안전하다. 이 파일을 적용한 뒤 202610200001을 다시 돌리면 질문이 빠지니 이 파일도 다시 돌릴 것.

alter table public.work_records add column if not exists early_out boolean not null default false;

create or replace function public.work_early(p_id bigint, p_yes boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.teacher_accounts := private.msg_me();
  v_row public.work_records;
  v_pres public.msg_presence;
begin
  if v_me.user_id is null then
    raise exception 'not_teacher' using errcode = '42501';
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
  if coalesce(p_yes, false) then
    update public.work_records set early_out = true, updated_at = now() where id = p_id returning * into v_row;
    return to_jsonb(v_row);
  end if;
  -- 퇴근 취소: 본인 것, 오늘, 그 뒤로 다시 출근하지 않았을 때만
  if v_row.user_id <> v_me.user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_row.ymd <> private.work_today() or exists (select 1 from public.work_records r where r.user_id = v_row.user_id and r.ymd = v_row.ymd and r.id > v_row.id) then
    raise exception 'too_late';
  end if;
  update public.work_records set out_at = null, end_at = null, early_out = false, updated_at = now() where id = p_id;
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
revoke all on function public.work_early(bigint, boolean) from public, anon;
grant execute on function public.work_early(bigint, boolean) to authenticated;

-- 슈톡 출근·퇴근 — 202610200001 본문에 조기퇴근 질문(work.early·early_diff)을 더하고, 퇴근 시각 계산은 work_recalc로 한 곳에 모은다.
-- (아래 설명은 202610200001 그대로) 슈톡 출근·퇴근(202610190004)에 근무 기록을 더한다 — 본문은 그대로, 근무 일지에 드는 사람만 기록하고 결과에 work를 붙인다.
--   출근: 오늘 열린 기록이 없으면 새로 연다(센터만 바꾸는 출근은 이어 간다). 근무표 시작보다 이르면 시작 시각부터 센다 → work.clipped,
--         30분 넘게 이르면 work.ask(슈톡이 '초과근무인가요?'를 묻는다)
--   퇴근: 오늘 열린 기록을 닫는다. 근무표 끝보다 늦으면 끝 시각까지 센다, 30분 넘게 늦으면 work.ask
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
      v_work := jsonb_build_object('id', v_rec.id, 'event', 'out',
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
