-- 정연주 선생님 허브 계정을 2026-11-07(토) 새벽 5시 05분(한국 시각 = 11/6 20:05 UTC)에 비활성화한다.
-- (2026-10-26 원장님 "정연주 선생님 허브 계정도 11/7자로 비활성화해줘")
-- 허브에는 비활성화 화면·함수가 없어 DB 예약(pg_cron)으로 한 번만 돌린다. 관리 API(sbp_ 토큰) 또는 SQL Editor에서 실행.
-- 비활성(active=false)이 되면: 허브 로그인 게이트가 not_teacher로 막고, 슈톡 구성원·알림·출근 목록에서 빠진다. 기록은 남는다.

create extension if not exists pg_cron;

-- 혹시 같은 이름의 예약이 있으면 지우고 다시 건다.
do $$
begin
  perform cron.unschedule('deactivate-jyj-20261107');
exception when others then null;
end $$;

select cron.schedule(
  'deactivate-jyj-20261107',
  '5 20 6 11 *',   -- 11월 6일 20:05 UTC = 11월 7일 05:05 KST (pg_cron은 UTC)
  $job$
    update public.teacher_accounts
       set active = false, updated_at = now()
     where display_name = '정연주' and active;
    select cron.unschedule('deactivate-jyj-20261107');   -- 한 번만
  $job$
);

-- 미리 확인: 대상이 한 줄인지
select login_id, display_name, role, active from public.teacher_accounts where display_name = '정연주';
-- 걸린 예약 확인
select jobid, jobname, schedule, active from cron.job where jobname = 'deactivate-jyj-20261107';

-- 11/7 이후 확인: 아래가 active=false 한 줄이면 끝.
-- select login_id, display_name, active, updated_at from public.teacher_accounts where display_name = '정연주';
-- 예약 없이 바로 하려면(11/7 이후): update public.teacher_accounts set active=false, updated_at=now() where display_name='정연주' and active;
