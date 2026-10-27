-- 박언호 대표님 허브 계정 표시 이름 '박언호' → '박언호대표님' (2026-10-27 원장님 "슈톡의 박언호 이름을 대표님으로" → "박언호->박언호대표님")
-- 2026-10-27 관리 API로 실제 수파베이스에 적용 완료(원장님이 준 sbp_ 토큰, 저장 안 함). 기록용 — 다시 돌리면 아무것도 바뀌지 않는다(where 조건).
-- 권한(강사 관리·급여 보기·초과근무 승인자·늘 알림 받기·27 예상 시간표)은 login_id 'parkeh' 기준이라 그대로.
-- 지난 메시지·할 일·출근 기록·근무 기록에 적힌 '박언호'는 그대로 둔다(기록). 함께 맞춘 현재 상태: msg_presence.name, '대기' 할 일의 assignee_name(2건).
-- 시간표 담당T '언호'(논술B 수학)와는 화면·함수의 teacherKey가 끝의 '대표님'을 떼고 대조한다(messenger.html·staff.html·question.html·_shared/push.ts — msg-push·closhu 함수는 다시 배포해야 적용).
with a as (
  update public.teacher_accounts set display_name = '박언호대표님'
  where login_id = 'parkeh' and display_name = '박언호' returning user_id
), p as (
  update public.msg_presence set name = '박언호대표님' where user_id in (select user_id from a) returning 1
), t as (
  update public.msg_tasks set assignee_name = '박언호대표님'
  where assignee in (select user_id from a) and status = '대기' and assignee_name = '박언호' returning 1
)
select (select count(*) from a) as acct, (select count(*) from p) as pres, (select count(*) from t) as tasks;
