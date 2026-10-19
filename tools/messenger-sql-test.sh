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
P -f supabase/migrations/202610190002_messenger_push.sql >/dev/null || { echo "푸시 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190002_messenger_push.sql >/dev/null && ok y y "푸시 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610190003_teacher_unique_name.sql >/dev/null || { echo "이름 중복 금지 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190004_messenger_presence.sql >/dev/null || { echo "출근 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190004_messenger_presence.sql >/dev/null && ok y y "출근 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610190005_messenger_seen_all.sql >/dev/null || { echo "확인·모두 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190005_messenger_seen_all.sql >/dev/null && ok y y "확인·모두 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610190006_messenger_reply.sql >/dev/null || { echo "답장 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610190006_messenger_reply.sql >/dev/null && ok y y "답장 마이그레이션 다시 실행해도 오류 없음"

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

echo "── 활성 계정 이름 중복 금지"
psql -X -q -d $DB -c "insert into auth.users values ('ffffffff-0000-0000-0000-000000000006'),('ffffffff-0000-0000-0000-000000000007')" >/dev/null
ok "$(psql -X -A -t -q -d $DB -c "insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values ('ffffffff-0000-0000-0000-000000000006','dup1',' 이은지 ','teacher',true)" 2>&1 | grep -c teacher_accounts_active_name_uniq)" 1 "활성 계정은 같은 이름(앞뒤 공백 무시) 거절"
ok "$(psql -X -A -t -q -d $DB -c "insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values ('ffffffff-0000-0000-0000-000000000007','dup2','옛선생','teacher',false) returning 1" 2>&1 | tail -1)" 1 "비활성 계정끼리는 같은 이름 허용"
echo "── 휴대폰 알림 구독"
SUB='{"endpoint":"https://fcm.googleapis.com/fcm/send/abc","keys":{"p256dh":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","auth":"aaaaaaaaaaaaaaaa"}}'
ok "$(as $C "select public.msg_push_save('$SUB', 'all', 'iPhone')->>'mode'")" "all" "구독 저장"
ok "$(as $C "select public.msg_push_state('https://fcm.googleapis.com/fcm/send/abc')->>'saved'")" "true" "내 구독 확인"
ok "$(as $B "select public.msg_push_state('https://fcm.googleapis.com/fcm/send/abc')->>'saved'")" "false" "남의 구독은 안 보임"
ok "$(as $B "select public.msg_push_save('$SUB', 'mention', '')->>'mode'")" "mention" "같은 기기를 다른 사람이 저장하면 주인이 바뀜"
ok "$(psql -X -A -t -q -d $DB -c "select count(*)||'|'||min(user_id::text) from public.msg_push_subs")" "1|$B" "기기당 한 줄"
ok "$(as $C "select public.msg_push_remove('https://fcm.googleapis.com/fcm/send/abc')->>'removed'")" "0" "남의 구독은 못 지움"
ok "$(as $B "select public.msg_push_remove('https://fcm.googleapis.com/fcm/send/abc')->>'removed'")" "1" "내 구독 지우기"
ok "$(as $B "select public.msg_push_save('{\"endpoint\":\"http://x\",\"keys\":{\"p256dh\":\"BBBBBBBBBBBBBBBBBBBBBBBBB\",\"auth\":\"aaaaaaaaaa\"}}', 'all', '')" | grep -c bad_sub)" 1 "https 아닌 주소 거절"
ok "$(as $E "select public.msg_push_save('$SUB', 'all', '')" | grep -c not_teacher)" 1 "계정 없는 로그인은 구독 못 함"
ok "$(as $B "select count(*) from public.msg_push_subs" | grep -c 'permission denied')" 1 "구독 표는 직접 못 읽음"
ok "$(anon "select public.msg_push_save('$SUB', 'all', '')" | grep -c 'permission denied')" 1 "공개 키는 함수 실행 불가"

echo "── 출근·퇴근"
ok "$(as $C "select public.msg_presence_set('화정센터', true)->>'loc'")" "화정센터" "출근 — 센터 저장"
ok "$(as $C "select name||'|'||is_on from public.msg_presence where user_id='$C'")" "고희주|true" "이름은 서버가 정함 · ON"
ok "$(as $C "select public.msg_presence_set('본원', true)->>'loc'")" "본원" "센터 바꾸기 — 한 줄 그대로"
ok "$(as $C "select (public.msg_presence_set('', false)->>'is_on')||'|'||(select loc from public.msg_presence where user_id='$C')")" "false|본원" "퇴근 — OFF, 마지막 센터는 남김"
ok "$(as $B "select count(*) from public.msg_presence_log where user_id='$C'")" 3 "누를 때마다 기록 한 줄 · 다른 교사도 읽음"
ok "$(as $C "select public.msg_presence_set('집', true)" | grep -c bad_loc)" 1 "없는 센터 거절"
ok "$(as $E "select public.msg_presence_set('본원', true)" | grep -c not_teacher)" 1 "계정 없는 로그인은 못 씀"
ok "$(as $B "insert into public.msg_presence(user_id,name,loc,is_on) values ('$B','x','본원',true)" | grep -c 'permission denied')" 1 "표에 직접 쓰기 불가"
ok "$(as $E "select count(*) from public.msg_presence")" 0 "계정 없는 로그인은 읽어도 0줄"
ok "$(anon "select count(*) from public.msg_presence" | grep -c 'permission denied')" 1 "공개 키는 표를 못 읽음"

echo "── 확인했습니다 · @모두"
MA=$(as $B "select (public.msg_send('내일 시험지 배부합니다 @모두', '[]', '{}')->'message'->>'id')")
ok "$(as $B "select count(*)||'|'||bool_and(ack_only)||'|'||min(text) from public.msg_tasks where message_id=$MA")" "2|true|내일 시험지 배부합니다" "@모두 = 나 빼고 활성 교사 모두(비활성 제외) · 확인만 · 글에서 @모두 뺌"
TA=$(as $B "select id from public.msg_tasks where message_id=$MA and assignee='$C'")
ok "$(as $A "select public.msg_task_seen($TA)" | grep -c not_allowed)" 1 "남의 할 일은 확인 못 함(관리자도)"
TB=$(as $B "select id from public.msg_tasks where message_id=$MA and assignee='$A'")
ok "$(as $B "select public.msg_task_set($TB, true)" | grep -c not_allowed)" 1 "@모두 할 일은 보낸 사람도 대신 완료 못 함"
ok "$(as $A "select public.msg_task_set($TB, true)->>'status'")" "완료" "맡은 사람(관리자 본인 몫)은 체크 가능"
ok "$(as $C "select (public.msg_task_seen($TA)->>'status')||'|'||(public.msg_task_seen($TA)->>'seen_at' is not null)")" "완료|true" "@모두는 확인을 누르면 완료"
ok "$(as $C "select done_by_name from public.msg_tasks where id=$TA")" "고희주" "완료한 사람 = 확인한 사람"
ok "$(as $C "select public.msg_task_set($TA, false)" | grep -c ack_locked)" 1 "@모두 확인은 되돌리지 않음"
MN=$(as $A "select (public.msg_send('상담 일정 잡아 주세요 @고희주', '[]', array['$C']::uuid[])->'message'->>'id')")
TN=$(as $A "select id from public.msg_tasks where message_id=$MN")
ok "$(as $C "select (public.msg_task_seen($TN)->>'status')||'|'||(public.msg_task_seen($TN)->>'seen_at' is not null)")" "대기|true" "보통 할 일은 확인해도 대기 그대로(알았다는 표시만)"
MN2=$(as $A "select (public.msg_send('출석부 정리 @고희주', '[]', array['$C']::uuid[])->'message'->>'id')")
TN2=$(as $A "select id from public.msg_tasks where message_id=$MN2")
ok "$(as $C "select (public.msg_task_set($TN2, true)->>'seen_at') is not null")" "t" "확인 없이 완료해도 확인으로 침"
ok "$(as $A "select ack_only from public.msg_tasks where id=$TN")" "f" "보통 할 일은 ack_only 아님"
ok "$(anon "select public.msg_task_seen($TN)" | grep -c 'permission denied')" 1 "공개 키는 확인 함수 실행 불가"

echo "── 답장"
ok "$(psql -X -A -t -q -d $DB -c "select count(*) from pg_proc where proname='msg_send'")" 1 "msg_send는 하나(네 인자)"
R0=$(as $C "select (public.msg_send('질문 있습니다', '[]', '{}')->'message'->>'id')")
R1=$(as $A "select (public.msg_send(p_body => '네 말씀하세요', p_reply => $R0)->'message'->>'reply_to')")
ok "$R1" "$R0" "답장 = reply_to 저장"
ok "$(as $A "select public.msg_send(p_body => 'x', p_reply => 999999)" | grep -c bad_reply)" 1 "없는 메시지에 답장 거절"
as $C "select public.msg_delete($R0)" >/dev/null
ok "$(as $A "select reply_to from public.msg_messages where reply_to=$R0 limit 1")" "$R0" "원글을 지워도 답장 연결은 남음"

echo "통과 $pass · 실패 $fail"
psql -q -d postgres -c "drop database if exists $DB" >/dev/null
[ $fail -eq 0 ]
