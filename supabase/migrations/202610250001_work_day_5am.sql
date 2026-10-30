-- 근무일의 끝을 새벽 5시로 (2026-10-25 원장님 "12시가 넘어가면 어떻게 퇴근하나요?" → "새벽 5시로")
-- 그전엔 0시에 날짜가 바뀌어, 자정 넘어 [퇴근]하면 어제 열린 근무 기록을 찾지 못해 '퇴근 기록 없음'으로 남았다.
-- 이제 새벽 5시 전까지는 어제 근무일로 본다 — msg_presence_set(퇴근)·work_fill·work_fix 등 work_today()를 쓰는 곳이 모두 따라온다.
-- 화면(messenger.html workYmd, worklog.html todayYmd)도 같은 기준.
create or replace function private.work_today()
returns date language sql stable set search_path = '' as $$ select ((now() at time zone 'Asia/Seoul') - interval '5 hours')::date $$;
revoke all on function private.work_today() from public;
grant execute on function private.work_today() to authenticated;
