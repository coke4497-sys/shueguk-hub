#!/usr/bin/env bash
# 대기생 명단 마이그레이션(202610290001_waitlist.sql + 202610300001_waitlist_status.sql) 로컬 PostgreSQL 검사
#   PGHOST=/home/pgtest PGPORT=5499 PGUSER=postgres bash tools/waitlist-sql-test.sh
# 새 데이터베이스(waittest)에 auth 흉내 + students 흉내 표를 만들고 마이그레이션을 적용해
# 권한(공개 키 차단·교사 읽기쓰기)·제약·상태 바뀜 트리거·학생 삭제 시 비움을 검사한다. 원격 수파베이스에는 절대 돌리지 말 것.
set -u
cd "$(dirname "$0")/.."
DB=waittest
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P() { psql -q -X -v ON_ERROR_STOP=1 -d $DB "$@"; }
Q() { psql -q -X -tA -d $DB "$@" 2>&1; }
pass=0; fail=0
ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "  ✓ $3"; else fail=$((fail+1)); echo "  ✗ $3 — 기대 [$2] 실제 [$1]"; fi; }

P >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
-- students 흉내(리포트 저장소 003) — 재원생 줄 잇기(student_id) 검사용
create table public.students (id bigint generated always as identity primary key, name text not null default '', school text not null default '', grade text not null default '');
grant select on public.students to authenticated;
insert into public.students (name, school, grade) values ('김민준', '서정중', '2026 중등 3학년');
SQL
P -f supabase/migrations/202610290001_waitlist.sql >/dev/null || { echo "마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610290001_waitlist.sql >/dev/null && ok y y "다시 실행해도 오류 없음"

echo "① 공개 키(anon)는 아무것도 못 한다"
r=$(Q -c "set role anon; select count(*) from public.student_waitlist;"); case "$r" in *"permission denied"*) ok y y "anon 읽기 거절";; *) ok "$r" "permission denied" "anon 읽기 거절";; esac
r=$(Q -c "set role anon; insert into public.student_waitlist (kind, name) values ('예비','테스트');"); case "$r" in *"permission denied"*) ok y y "anon 쓰기 거절";; *) ok "$r" "permission denied" "anon 쓰기 거절";; esac

echo "② 교사(authenticated) 넣기·읽기 — 기본값"
AUTH="set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';"
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name, year, grade, school, phone_parent, want_book, want_class_id, want_class_name, cap, memo, author_name)
  values ('예비', '박보검', 2027, '고1', '화정고', '01012345678', '정규', 'r001', '고1 가 · 금 5:30 · 지원T', 12, '2월 입학 상담', '고희주') returning id||'|'||status||'|'||(started_on = (now() at time zone 'Asia/Seoul')::date)||'|'||done_by_name;")
ok "$r" "1|대기|true|" "예비 줄 — 상태 대기 · 대기 시작일 = 오늘(한국) · 완료 칸 비어 있음"
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name, student_id, grade, school, want_book, want_class_id, cap, author_name) select '재원', name, id, '중3', school, '내신', 'n001', 9, '이은지' from public.students where name='김민준' returning id||'|'||student_id;")
ok "$r" "2|1" "재원 줄 — students 줄을 student_id 로 잇는다"
r=$(Q -c "$AUTH select count(*) from public.student_waitlist where status='대기';"); ok "$r" "2" "교사는 전부 읽는다"

echo "③ 제약"
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name) values ('대기','x');"); case "$r" in *check*) ok y y "kind 는 예비·재원만";; *) ok "$r" check "kind 는 예비·재원만";; esac
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name) values ('예비','   ');"); case "$r" in *check*) ok y y "이름 빈 값 거절";; *) ok "$r" check "이름 빈 값 거절";; esac
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name, want_book) values ('예비','x','정규가');"); case "$r" in *check*) ok y y "want_book 은 ''·정규·내신만";; *) ok "$r" check "want_book 은 ''·정규·내신만";; esac
r=$(Q -c "$AUTH update public.student_waitlist set status='등록' where id=1;"); case "$r" in *check*) ok y y "status 는 대기·완료·취소만";; *) ok "$r" check "status 는 대기·완료·취소만";; esac
r=$(Q -c "$AUTH insert into public.student_waitlist (kind, name, want_class_id) values ('예비','미정 학생','') returning want_book||'|'||want_class_id||'|'||coalesce(cap::text,'null');")
ok "$r" "||null" "희망 반 미정(빈 값·cap 없음)도 들어간다"

echo "④ 상태 바뀜 트리거"
r=$(Q -c "$AUTH update public.student_waitlist set status='완료', done_by_name='고희주', done_note='등록 전환' where id=1 returning (done_at is not null)||'|'||done_by_name||'|'||(updated_at > created_at);")
ok "$r" "true|고희주|true" "완료로 바꾸면 done_at 자동 · updated_at 갱신"
r=$(Q -c "$AUTH update public.student_waitlist set status='대기' where id=1 returning coalesce(done_at::text,'null')||'|'||done_by_name||'|'||done_note;")
ok "$r" "null||" "다시 대기로 돌리면 완료 칸이 비워진다"
r=$(Q -c "$AUTH update public.student_waitlist set status='취소', done_note='다른 학원 등록', done_by_name='이은지' where id=1 returning status||'|'||(done_at is not null)||'|'||done_note;")
ok "$r" "취소|true|다른 학원 등록" "취소 + 사유"
r=$(Q -c "$AUTH update public.student_waitlist set memo='메모만 고침' where id=2 returning status||'|'||coalesce(done_at::text,'null');")
ok "$r" "대기|null" "메모만 고치면 상태·완료 칸 그대로"

echo "⑤ 학생 삭제 → 재원 줄은 남고 student_id 만 비움"
r=$(Q -c "delete from public.students where id=1; select coalesce(student_id::text,'null')||'|'||name from public.student_waitlist where id=2;")
ok "$r" "null|김민준" "아웃 처리돼도 대기 줄은 남는다"

echo "⑥ 교사 지우기"
r=$(Q -c "$AUTH delete from public.student_waitlist where name='미정 학생' returning name;"); ok "$r" "미정 학생" "교사는 지울 수 있다"

echo "⑦ 대기 상태 넓히기 — 202610300001 (2026-10-30 원장님: 대기·입학·입테탈락·블랙·회신없음·의사없음 + 삭제)"
Q -c "$AUTH insert into public.student_waitlist (kind, name, status, done_note) values ('예비','전환완료','완료','신입 등록 전환'), ('재원','이동완료','완료','반 이동 완료'), ('예비','옛취소','취소','연락 두절'); update public.student_waitlist set done_at = now() where name in ('전환완료','이동완료','옛취소');" >/dev/null
P -f supabase/migrations/202610300001_waitlist_status.sql >/dev/null || { echo "202610300001 실패"; fail=$((fail+1)); }
P -f supabase/migrations/202610300001_waitlist_status.sql >/dev/null && ok y y "202610300001 다시 실행해도 오류 없음"
r=$(Q -c "$AUTH select name||'|'||status||'|'||(done_at is not null) from public.student_waitlist where name in ('전환완료','이동완료','옛취소') order by name;")
ok "$r" "$(printf '옛취소|취소|true\n이동완료|완료|true\n전환완료|입학|true')" "예비 '완료'는 '입학'으로(done_at 그대로), 재원 '완료'·옛 '취소'는 그대로"
for st in 입학 입테탈락 블랙 회신없음 의사없음; do
  r=$(Q -c "$AUTH update public.student_waitlist set status='$st', done_by_name='고희주', done_note='메모' where id=2 returning status||'|'||(done_at is not null)||'|'||done_note;"); ok "$r" "$st|true|메모" "상태 $st 저장"
done
r=$(Q -c "$AUTH update public.student_waitlist set status='대기' where id=2 returning status||'|'||coalesce(done_at::text,'null')||'|'||done_note;"); ok "$r" "대기|null|" "다시 대기로 돌리면 완료 칸 비움(트리거 그대로)"
r=$(Q -c "$AUTH update public.student_waitlist set status='등록' where id=2;"); case "$r" in *check*) ok y y "목록 밖 상태('등록')는 여전히 거절";; *) ok "$r" check "목록 밖 상태('등록')는 여전히 거절";; esac
r=$(Q -c "$AUTH delete from public.student_waitlist where name='옛취소' returning name;"); ok "$r" "옛취소" "교사는 지난 줄도 지울 수 있다"
r=$(Q -c "set role anon; delete from public.student_waitlist where id=2;"); case "$r" in *"permission denied"*) ok y y "anon 삭제 거절";; *) ok "$r" "permission denied" "anon 삭제 거절";; esac

echo; echo "$pass 통과 / $fail 실패"
[ "$fail" = 0 ]
