-- 조교 근무 일지 초기값 (202610200001_work_log.sql 다음에 한 번 실행한다. 다시 실행해도 안전하다)
-- 출처: 시트 「★자습감독 근무일지」 — Day 탭 28행 실명·시급(2026년 10월), week 탭 마지막 주(2026.10.26~11.1) 근무표.
-- 허브 계정 이름(teacher_accounts.display_name)과 정확히 같은 사람만 들어간다. 맨 아래 select가 못 찾은 이름을 보여 준다.
-- 근무 시간(시트 Day 탭 기록 기준): 수 16:00~22:30 · 목·금 16:00~22:00 · 토·일 10:30~20:00. 본원은 목~일 두 명이 함께 근무(자리 1·2).

with w(name, wage) as (values
  ('김영훈', 13000), ('고정은', 13000), ('박윤서', 13000), ('최예나', 13000),
  ('김상우', 12500), ('이종민', 12500), ('조예나', 12500), ('권윤수', 12500),
  ('강소망', 12000), ('박지수', 12000), ('고희주', 12000), ('박준영', 12000), ('심현준', 12000), ('조수민', 12000))
insert into public.work_staff (user_id, wage, active)
select t.user_id, w.wage, true
from w join public.teacher_accounts t on t.display_name = w.name and t.active
on conflict (user_id) do update set wage = excluded.wage, active = true, updated_at = now();

with r(dow, loc, slot, name) as (values
  (3, '본원', 1, '권윤수'),
  (4, '본원', 1, '최예나'), (4, '본원', 2, '고희주'),
  (5, '본원', 1, '고정은'), (5, '본원', 2, '조수민'),
  (6, '본원', 1, '최예나'), (6, '본원', 2, '강소망'),
  (7, '본원', 1, '고희주'), (7, '본원', 2, '박지수'),
  (5, '정리정독', 1, '박윤서'), (6, '정리정독', 1, '권윤수'), (7, '정리정독', 1, '김상우'),
  (3, '화정센터', 1, '심현준'), (4, '화정센터', 1, '김영훈'), (5, '화정센터', 1, '박준영'),
  (6, '화정센터', 1, '김영훈'), (7, '화정센터', 1, '고정은'), (7, '화정센터', 2, '조예나'),
  (3, '민초센터', 1, '강소망'), (4, '민초센터', 1, '조예나'), (5, '민초센터', 1, '이종민'),
  (6, '민초센터', 1, '조수민'), (7, '민초센터', 1, '심현준'))
insert into public.work_roster (dow, loc, slot, user_id, start_hm, end_hm)
select r.dow, r.loc, r.slot, t.user_id,
       case when r.dow >= 6 then '10:30' else '16:00' end,
       case when r.dow >= 6 then '20:00' when r.dow = 3 then '22:30' else '22:00' end
from r join public.teacher_accounts t on t.display_name = r.name and t.active
on conflict (dow, loc, slot) do update set user_id = excluded.user_id, start_hm = excluded.start_hm, end_hm = excluded.end_hm;

-- 허브 계정에서 못 찾은 이름(있으면 계정 이름을 맞춘 뒤 다시 실행)
select n as "계정을 못 찾은 이름" from unnest(array['김영훈','고정은','박윤서','최예나','김상우','이종민','조예나','권윤수','강소망','박지수','고희주','박준영','심현준','조수민']) n
where not exists (select 1 from public.teacher_accounts t where t.display_name = n and t.active);
