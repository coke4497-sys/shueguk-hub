#!/usr/bin/env bash
# 슈국 대화방 마이그레이션(202610190001_messenger.sql) 로컬 PostgreSQL 검사
#   PGHOST=/home/pgtest PGPORT=5499 PGUSER=postgres bash tools/messenger-sql-test.sh
# 새 데이터베이스(msgtest)를 만들어 auth·storage 흉내 → 교사 계정 마이그레이션 → 대화방 마이그레이션을 적용하고
# 함수·권한을 검사한다. 원격 수파베이스에는 절대 돌리지 말 것.
set -u
cd "$(dirname "$0")/.."
DB=msgtest
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
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id bigserial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
grant usage on all sequences in schema storage to authenticated;
grant usage on schema public to anon, authenticated;
SQL
P -f supabase/migrations/202609290001_teacher_accounts.sql >/dev/null
P -f supabase/migrations/202609290003_teacher_admin.sql >/dev/null
P -f supabase/migrations/202609290004_teacher_assistant_role.sql >/dev/null
P -f supabase/migrations/202610190001_messenger.sql >/dev/null || { echo "마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190001_messenger.sql >/dev/null && ok y y "다시 실행해도 오류 없음"

A=aaaaaaaa-0000-0000-0000-000000000001   # 원장(admin)
B=bbbbbbbb-0000-0000-0000-000000000002   # 이은지 선생님
C=cccccccc-0000-0000-0000-000000000003   # 고희주 조교
D=dddddddd-0000-0000-0000-000000000004   # 퇴사(비활성)
E=eeeeeeee-0000-0000-0000-000000000005   # 계정 없는 로그인(공용 계정 같은 것)
P >/dev/null <<SQL
insert into auth.users values ('$A'),('$B'),('$C'),('$D'),('$E');
insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values
 ('$A','admin','이수경','admin',true), ('$B','eunji','이은지','teacher',true),
 ('$C','heeju','고희주','assistant',true), ('$D','old','옛선생','teacher',false);
SQL

# 사용자로 실행: as <uid> <sql>
last(){ local o; o=$(cat); if grep -q 'ERROR' <<<"$o"; then grep -m1 'ERROR' <<<"$o"; else tail -n 1 <<<"$o"; fi; }
as(){ local uid=$1; shift; psql -X -A -t -q -d $DB -c "set role authenticated; set request.jwt.claim.sub='$uid';" -c "$1" 2>&1 | last; }
anon(){ psql -X -A -t -q -d $DB -c "set role anon;" -c "$1" 2>&1 | last; }

ok "$(as $B "select count(*) from public.msg_members()")" 3 "사람 목록 = 활성 교사 3명"
ok "$(as $E "select count(*) from public.msg_members()" | grep -c not_teacher)" 1 "계정 없는 로그인은 목록을 못 받음"
ok "$(anon "select count(*) from public.msg_members()" | grep -c 'permission denied')" 1 "공개 키는 함수 실행 불가"

R=$(as $B "select public.msg_send('중3 김민준 할머니 생신으로 금일 결석입니다. @고희주 조교', '[]', array['$C']::uuid[])->'tasks'->0->>'text'")
ok "$R" "중3 김민준 할머니 생신으로 금일 결석입니다." "할 일 글에서 @이름·'조교'를 뺌"
ok "$(as $B "select author_name||'|'||body from public.msg_messages order by id desc limit 1")" "이은지|중3 김민준 할머니 생신으로 금일 결석입니다. @고희주 조교" "작성자 이름은 서버가 정함"
ok "$(as $C "select assignee_name||'|'||requester_name||'|'||status from public.msg_tasks order by id desc limit 1")" "고희주|이은지|대기" "할 일 한 줄 — 맡은 사람·맡긴 사람·대기"

as $A "select public.msg_send('퇴원 처리 @이은지T @고희주', '[]', array['$B','$C','$D']::uuid[])" >/dev/null
ok "$(as $A "select count(*) from public.msg_tasks where message_id=(select max(id) from public.msg_messages)")" 2 "여러 명 부르면 각자 한 줄 · 비활성은 제외"
ok "$(as $A "select distinct text from public.msg_tasks where message_id=(select max(id) from public.msg_messages)")" "퇴원 처리" "@이름T 도 글에서 뺌"

as $B "select public.msg_send('@고희주', '[]', array['$C']::uuid[])" >/dev/null
ok "$(as $B "select text from public.msg_tasks order by id desc limit 1")" "메시지 확인" "이름만 부른 메시지는 '메시지 확인'"

ok "$(as $B "select public.msg_send('   ', '[]', '{}')" | grep -c empty)" 1 "빈 메시지 거절"
ok "$(as $B "select public.msg_send('x', '[{\"path\":\"../etc\",\"name\":\"a\"}]', '{}')" | grep -c bad_files)" 1 "이상한 파일 경로 거절"
F='[{"path":"m/202610/abcdefghijklmnop.pdf","name":"시험지.pdf","size":10,"mime":"application/pdf"}]'
ok "$(as $B "select jsonb_array_length(public.msg_send('', '$F', '{}')->'message'->'files')")" 1 "파일만 보내기"
ok "$(as $E "select public.msg_send('hi', '[]', '{}')" | grep -c not_teacher)" 1 "계정 없는 로그인은 못 보냄"
ok "$(as $B "insert into public.msg_messages(author_name, body) values ('가짜','x')" | grep -c 'permission denied')" 1 "표에 직접 쓰기 불가"
ok "$(anon "select count(*) from public.msg_messages" | grep -c 'permission denied')" 1 "공개 키는 표를 못 읽음"
ok "$(as $E "select count(*) from public.msg_messages")" 0 "계정 없는 로그인은 읽어도 0줄"

T=$(as $B "select id from public.msg_tasks where assignee='$C' order by id limit 1")
ok "$(as $B "select public.msg_task_set($T, true)->>'status'")" "완료" "맡긴 사람도 체크 가능"
ok "$(as $B "select done_by_name from public.msg_tasks where id=$T")" "이은지" "체크한 사람 이름 기록"
T2=$(as $A "select id from public.msg_tasks where assignee='$B' order by id limit 1")
ok "$(as $C "select public.msg_task_set($T2, true)" | grep -c not_allowed)" 1 "남의 할 일(맡긴 사람도 아님)은 체크 불가"
ok "$(as $B "select public.msg_task_set($T2, true)->>'status'")" "완료" "맡은 사람은 체크"
ok "$(as $B "select public.msg_task_set($T2, false)->>'status'")" "대기" "체크 해제"
ok "$(as $B "select coalesce(done_at::text,'null') from public.msg_tasks where id=$T2")" "null" "해제하면 완료 시각 지움"
ok "$(as $A "select public.msg_task_set($T2, true)->>'done_by_name'")" "이수경" "관리자는 누구 것이든 체크"

M=$(as $A "select message_id from public.msg_tasks where id=$T2")
ok "$(as $C "select public.msg_delete($M)" | grep -c not_allowed)" 1 "남의 메시지 지우기 불가"
ok "$(as $A "select (public.msg_delete($M)->>'deleted_at') is not null")" "t" "내 메시지 지우기"
ok "$(as $A "select count(*) from public.msg_tasks where message_id=$M")" 0 "지운 메시지의 할 일도 지움"
ok "$(as $A "select body||'|'||files::text from public.msg_messages where id=$M")" "|[]" "글·파일 목록 비움"

ok "$(psql -X -A -t -q -d $DB -c "select public||'|'||file_size_limit from storage.buckets where id='msg-files'")" "false|20971520" "비공개 파일 버킷 20MB"
ok "$(as $C "insert into storage.objects(bucket_id,name) values ('msg-files','m/202610/x') returning 1")" 1 "교사는 파일 올림"
ok "$(as $E "insert into storage.objects(bucket_id,name) values ('msg-files','m/202610/y')" | grep -c 'row-level security')" 1 "계정 없는 로그인은 파일 못 올림"

echo "통과 $pass · 실패 $fail"
psql -q -d postgres -c "drop database if exists $DB" >/dev/null
[ $fail -eq 0 ]
