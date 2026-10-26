#!/usr/bin/env bash
# 전체 커리큘럼 마이그레이션(202610250003_curriculum.sql)과 초기값 로컬 PostgreSQL 검사
#   PGHOST=/home/pgtest PGPORT=5499 PGUSER=postgres bash tools/curriculum-sql-test.sh
# 원격 수파베이스에는 절대 돌리지 말 것.
set -u
cd "$(dirname "$0")/.."
DB=curtest
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P() { psql -q -X -v ON_ERROR_STOP=1 -d $DB "$@"; }
pass=0; fail=0
ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "  ✓ $3"; else fail=$((fail+1)); echo "  ✗ $3 — 기대 [$2] 실제 [$1]"; fi; }

P >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
SQL
for f in 202609290001_teacher_accounts 202609290003_teacher_admin 202609290004_teacher_assistant_role; do
  P -f supabase/migrations/$f.sql >/dev/null || { echo "$f 실패"; exit 1; }
done
P -f supabase/migrations/202610250003_curriculum.sql >/dev/null || { echo "커리큘럼 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610250003_curriculum.sql >/dev/null && ok y y "다시 실행해도 오류 없음"
P -f supabase/커리큘럼-초기값.sql >/dev/null || { echo "초기값 실패"; exit 1; }
ok "$(P -tAc "select count(*) from public.curriculum_weeks")" "249" "초기값 주 249줄"
ok "$(P -tAc "select string_agg(grade||':'||n, ',' order by grade) from (select grade, count(*) n from public.curriculum_weeks group by grade) x")" "고1:51,고2:51,고3:48,중2:50,중3:49" "학년별 줄 수"
ok "$(P -tAc "select count(*) from public.curriculum_weeks where extract(isodow from week) <> 3")" "0" "모두 수요일"
ok "$(P -tAc "select count(distinct school) from public.curriculum_books where level='고등'")" "9" "고등 9개교"
ok "$(P -tAc "select count(distinct school) from public.curriculum_books where level='중등'")" "12" "중등 12개교"
ok "$(P -tAc "select publisher from public.curriculum_books where school='화정고' and term='2-2'")" "비상(이관규)" "화정고 2-2 출판사"
ok "$(P -tAc "select na from public.curriculum_weeks where grade='고3' and week='2025-12-24'")" "기출 슈타트 현대소설, 현대시" "고3 12/24(시트 12/14 오기 보정)"
P -f supabase/커리큘럼-초기값.sql >/dev/null && ok "$(P -tAc "select count(*) from public.curriculum_weeks")" "249" "초기값 다시 실행해도 그대로"

A=aaaaaaaa-0000-0000-0000-000000000001
T=bbbbbbbb-0000-0000-0000-000000000002
P >/dev/null <<SQL
insert into auth.users values ('$A'),('$T');
insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values
 ('$A','admin','이수경','admin',true), ('$T','eunji','이은지','teacher',true);
SQL
as(){ printf "set role %s; select set_config('request.jwt.claim.sub','%s',false);\n%s" "$1" "$2" "$3" | P -tA 2>&1 | grep -v '^$' | tail -1; }
aserr(){ printf "set role %s; select set_config('request.jwt.claim.sub','%s',false);\n%s" "$1" "$2" "$3" | P -tA 2>&1 | grep -c "$4"; }

ok "$(as authenticated $T "select count(*) from public.curriculum_weeks;")" "249" "선생님은 읽기 가능"
ok "$(as anon '' "select count(*) from public.curriculum_weeks;" | grep -c 'permission denied')" "1" "공개 키는 읽기 불가"
ok "$(as authenticated $T "update public.curriculum_weeks set ga='x';" | grep -c 'permission denied')" "1" "선생님 직접 수정 불가"
ok "$(aserr authenticated $T "select (public.curriculum_set(2026,'중2','2026-10-28','a','b','')).ga;" not_admin)" "1" "선생님은 함수로도 못 고침"
ok "$(as authenticated $A "select (public.curriculum_set(2026,'중2','2026-10-28',' 새 가 ','','확인')).updated_by_name;")" "이수경" "원장님 고치기 + 고친 사람"
ok "$(P -tAc "select ga||'|'||note from public.curriculum_weeks where grade='중2' and week='2026-10-28'")" "새 가|확인" "고친 값(앞뒤 공백 정리)"
ok "$(aserr authenticated $A "select public.curriculum_set(2026,'중2','2026-10-27','a','','');" not_wednesday)" "1" "수요일 아니면 거절"
ok "$(as authenticated $A "select (public.curriculum_book_set(2026,'중등','새중','2학년','국어','천재','')).ord;")" "13" "새 학교는 맨 뒤 순서"
ok "$(as authenticated $A "select (public.curriculum_book_set(2026,'고등','화정고','2-2','화법과 언어','비상','메모')).ord;")" "9" "있는 학교는 순서 유지"
ok "$(aserr authenticated $T "select public.curriculum_book_set(2026,'고등','화정고','2-2','x','x','');" not_admin)" "1" "선생님은 편제표도 못 고침"


echo "[202610260001 내신 대비 종류]"
P -f supabase/migrations/202610260001_curriculum_exam.sql >/dev/null || { echo "exam 마이그레이션 실패"; exit 1; }
ok "$(P -tAc "select exam from public.curriculum_weeks where grade='고1' and week='2026-11-18'")" "2학기 기말" "글에서 채움 — 고1 11/18 2학기 기말"
ok "$(P -tAc "select exam from public.curriculum_weeks where grade='고1' and week='2026-05-06'")" "1학기 중간" "중간고사 마무리도 1학기 중간"
ok "$(P -tAc "select exam from public.curriculum_weeks where grade='고1' and week='2026-02-04'")" "" "겨울 정기고사는 내신 대비 아님"
ok "$(P -tAc "select count(*) from public.curriculum_weeks where exam<>''")" "96" "채운 줄 수(초기값 기준 96주)"
P -tAc "update public.curriculum_weeks set exam='' where grade='고1' and week='2026-11-18'" >/dev/null
P -f supabase/migrations/202610260001_curriculum_exam.sql >/dev/null && ok "$(P -tAc "select exam from public.curriculum_weeks where grade='고1' and week='2026-11-18'")" "" "다시 실행해도 고친 값을 덮지 않음"
ok "$(as authenticated $A "select (public.curriculum_set(2026,'고1','2026-11-18','a','b','',' 2학기 기말')).exam;")" "2학기 기말" "p_exam 저장"
ok "$(as authenticated $A "select (public.curriculum_set(2026,'고1','2026-11-18','a2','b','')).exam;")" "2학기 기말" "p_exam 빼면 그대로"
ok "$(as authenticated $A "select coalesce(nullif((public.curriculum_set(2026,'고1','2026-11-18','a2','b','','')).exam,''),'(빈)');")" "(빈)" "빈 값이면 지움"
ok "$(aserr authenticated $A "select public.curriculum_set(2026,'고1','2026-11-18','a','b','','3학기');" bad_exam)" "1" "목록 밖 값 거절"
ok "$(aserr authenticated $T "select public.curriculum_set(2026,'고1','2026-11-18','a','b','','');" not_admin)" "1" "선생님 거절 그대로"
ok "$(P -tAc "select count(*) from pg_proc where proname='curriculum_set'")" "1" "옛 6인자 함수는 지움"

echo "통과 $pass · 실패 $fail"
[ $fail -eq 0 ]
