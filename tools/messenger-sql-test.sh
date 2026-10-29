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
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
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
grant usage on schema public to anon, authenticated, service_role;
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
P -f supabase/migrations/202610200001_messenger_cancel.sql >/dev/null || { echo "취소 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200001_messenger_cancel.sql >/dev/null && ok y y "취소 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200002_messenger_handover.sql >/dev/null || { echo "넘기기·미루기 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200002_messenger_handover.sql >/dev/null && ok y y "넘기기·미루기 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200003_messenger_attend_ack.sql >/dev/null || { echo "결석 확인 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200003_messenger_attend_ack.sql >/dev/null && ok y y "결석 확인 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200006_task_progress.sql >/dev/null || { echo "진행 중 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200006_task_progress.sql >/dev/null && ok y y "진행 중 마이그레이션 다시 실행해도 오류 없음"
for w in 202610200001_work_log 202610200002_work_overtime_approval 202610200003_work_early_out 202610200004_work_early_confirm; do P -f supabase/migrations/$w.sql >/dev/null || { echo "근무 일지 마이그레이션 실패 $w"; exit 1; }; done
P -f supabase/migrations/202610200005_staff_manage.sql >/dev/null || { echo "강사 관리 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200005_staff_manage.sql >/dev/null && ok y y "강사 관리 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200007_messenger_group_mention.sql >/dev/null || { echo "@조교·@선생님 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200007_messenger_group_mention.sql >/dev/null && ok y y "@조교·@선생님 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200007_messenger_bot.sql >/dev/null || { echo "클로슈 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200007_messenger_bot.sql >/dev/null && ok y y "클로슈 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200008_messenger_closhu.sql >/dev/null || { echo "클로슈(진짜 클로드) 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200008_messenger_closhu.sql >/dev/null && ok y y "클로슈(진짜 클로드) 마이그레이션 다시 실행해도 오류 없음"
P -f supabase/migrations/202610200009_messenger_kakao.sql >/dev/null || { echo "카카오채널 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200010_messenger_push_retry.sql >/dev/null || { echo "알림 다시 보내기 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200011_messenger_hand_gen.sql >/dev/null || { echo "위임 세대 마이그레이션 실패"; exit 1; }

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
svc(){ psql -X -A -t -q -d $DB -c "set role service_role;" -c "$1" 2>&1 | last; }
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

MS=$(as $B "select (public.msg_send('내 이름도 적은 공지 @모두 @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $B "select count(*) filter (where assignee='$B')||'|'||count(*) from public.msg_tasks where message_id=$MS")" "0|2" "@모두는 내 이름을 함께 적어도 나를 뺌"
echo "── 답장"
ok "$(psql -X -A -t -q -d $DB -c "select count(*) from pg_proc where proname='msg_send'")" 1 "msg_send는 하나(네 인자)"
R0=$(as $C "select (public.msg_send('질문 있습니다', '[]', '{}')->'message'->>'id')")
R1=$(as $A "select (public.msg_send(p_body => '네 말씀하세요', p_reply => $R0)->'message'->>'reply_to')")
ok "$R1" "$R0" "답장 = reply_to 저장"
ok "$(as $A "select public.msg_send(p_body => 'x', p_reply => 999999)" | grep -c bad_reply)" 1 "없는 메시지에 답장 거절"
as $C "select public.msg_delete($R0)" >/dev/null
ok "$(as $A "select reply_to from public.msg_messages where reply_to=$R0 limit 1")" "$R0" "원글을 지워도 답장 연결은 남음"

echo "── 할 일 취소 · 사유 (202610200001)"
MX=$(as $A "select (public.msg_send('시험지 출력 부탁 @고희주', '[]', array['$C']::uuid[])->'message'->>'id')")
TX=$(as $A "select id from public.msg_tasks where message_id=$MX")
ok "$(as $A "select public.msg_task_cancel($TX, '  ')" | grep -c need_reason)" 1 "사유 없이는 취소 못 함"
ok "$(as $B "select public.msg_task_cancel($TX, '상황 변경')" | grep -c not_allowed)" 1 "남의 할 일은 취소 못 함"
ok "$(as $C "select (public.msg_task_cancel($TX, ' 시험 연기로 필요 없음 ')->>'status')")" "취소" "맡은 사람이 사유와 함께 취소"
ok "$(as $C "select cancel_reason||'|'||done_by_name||'|'||(done_at is not null) from public.msg_tasks where id=$TX")" "시험 연기로 필요 없음|고희주|true" "사유·취소한 사람·시각이 남음"
ok "$(as $C "select public.msg_task_cancel($TX, '다시')" | grep -c not_pending)" 1 "이미 취소한 할 일은 다시 취소 못 함"
ok "$(as $C "select public.msg_task_set($TX, true)" | grep -c canceled)" 1 "취소한 할 일은 체크 못 함"
ok "$(as $C "select (public.msg_task_seen($TX)->>'status')")" "취소" "확인을 눌러도 취소 그대로"
ok "$(as $A "select (public.msg_task_cancel($TX, '', true)->>'status')")" "대기" "맡긴 사람이 되돌리면 대기"
ok "$(as $A "select cancel_reason||'|'||coalesce(done_by_name,'-')||'|'||(done_at is null) from public.msg_tasks where id=$TX")" "|-|true" "되돌리면 사유·취소한 사람 지움"
ok "$(as $A "select public.msg_task_cancel($TX, '', true)" | grep -c not_canceled)" 1 "취소 안 된 할 일은 되돌리기 없음"
MY=$(as $B "select (public.msg_send('회의 공지 @모두', '[]', '{}')->'message'->>'id')")
TY=$(as $B "select id from public.msg_tasks where message_id=$MY and assignee='$C'")
ok "$(as $C "select public.msg_task_cancel($TY, '못 가요')" | grep -c not_allowed)" 1 "@모두 받은 사람은 스스로 취소 못 함"
ok "$(as $B "select (public.msg_task_cancel($TY, '회의 취소')->>'status')")" "취소" "@모두 보낸 사람은 취소 가능"
ok "$(as $C "select (public.msg_task_seen($TY)->>'status')")" "취소" "@모두 확인이 취소를 완료로 덮지 않음"
ok "$(as $C "update public.msg_tasks set status='취소' where id=$TN" 2>&1 | grep -c 'permission denied')" 1 "표에 직접 쓰기 불가"
ok "$(anon "select public.msg_task_cancel($TX, 'x')" | grep -c 'permission denied')" 1 "공개 키는 취소 함수 실행 불가"
MZ=$(as $A "select (public.msg_send('두 가지 부탁 @고희주 @이은지', '[]', array['$C','$B']::uuid[])->'message'->>'id')")
TZ=$(as $A "select id from public.msg_tasks where message_id=$MZ and assignee='$C'")
as $A "select public.msg_task_cancel($TZ, '필요 없어짐')" >/dev/null
as $A "select public.msg_delete($MZ)" >/dev/null
ok "$(as $A "select count(*)||'|'||min(status)||'|'||min(cancel_reason) from public.msg_tasks where message_id=$MZ")" "1|취소|필요 없어짐" "메시지를 지워도 취소 기록은 남고 대기 할 일만 지움"
ok "$(as $A "select public.msg_task_cancel($TZ, '', true)" | grep -c msg_deleted)" 1 "지운 메시지의 취소는 되돌리지 않음"

echo "── 넘기기 · 미루기 (202610200002)"
MH=$(as $A "select (public.msg_send('교재 주문 @고희주', '[]', array['$C']::uuid[])->'message'->>'id')")
TH=$(as $A "select id from public.msg_tasks where message_id=$MH")
ok "$(as $B "select public.msg_task_delegate($TH, '$B', '')" | grep -c not_allowed)" 1 "상관없는 사람은 넘기지 못함"
ok "$(as $C "select public.msg_task_delegate($TH, '$D', '')" | grep -c bad_person)" 1 "비활성 교사에게는 못 넘김"
ok "$(as $C "select public.msg_task_delegate($TH, '$C', '')" | grep -c same_person)" 1 "지금 맡은 사람에게는 못 넘김"
as $C "select public.msg_task_seen($TH)" >/dev/null
ok "$(as $C "select (public.msg_task_delegate($TH, '$B', ' 오늘 센터 못 가요 ')->>'assignee_name')")" "이은지" "맡은 사람이 다른 사람에게 넘김"
ok "$(as $C "select (seen_at is null)||'|'||hand_push||'|'||hand_by||'|'||(history->-1->>'kind')||'|'||(history->-1->>'from')||'|'||(history->-1->>'to')||'|'||(history->-1->>'note') from public.msg_tasks where id=$TH")" "true|$B|$C|넘김|고희주|이은지|오늘 센터 못 가요" "넘김 기록·확인 초기화·알림 자리"
ok "$(as $C "select public.msg_task_defer($TH, now() + interval '1 day', '')" | grep -c not_allowed)" 1 "넘긴 뒤에는 옛 담당자가 미루지 못함"
ok "$(as $A "select public.msg_task_defer($TH, now() + interval '1 day', '')" | grep -c not_allowed)" 1 "관리자도 남의 약속은 대신 못 정함"
ok "$(as $B "select public.msg_task_defer($TH, now() - interval '1 hour', '')" | grep -c bad_until)" 1 "지난 시각으로는 못 미룸"
ok "$(as $B "select public.msg_task_defer($TH, now() + interval '90 days', '')" | grep -c bad_until)" 1 "60일 넘게는 못 미룸"
ok "$(as $B "select (public.msg_task_defer($TH, now() + interval '1 day', '내일 수업 끝나고')->>'due_note')")" "내일 수업 끝나고" "맡은 사람이 언제까지 하겠다고 미룸"
ok "$(as $B "select (due_at > now())||'|'||jsonb_array_length(history)||'|'||(history->-1->>'kind')||'|'||(history->-1->>'until' is not null) from public.msg_tasks where id=$TH")" "true|2|미룸|true" "미룸 기록이 쌓임"
ok "$(as $B "select (public.msg_task_defer($TH, null, '')->>'due_at') is null")" "t" "미룸 풀기"
ok "$(as $B "select history->-1->>'kind' from public.msg_tasks where id=$TH")" "미룸 해제" "미룸 해제도 기록"
ok "$(as $A "select (public.msg_task_delegate($TH, '$C', '')->>'assignee_name')")" "고희주" "맡긴 사람이 다시 넘김"
ok "$(as $B "select public.msg_task_delegate($TY, '$A', '')" | grep -c ack_only)" 1 "@모두 할 일은 넘기지 않음"
ok "$(as $C "update public.msg_tasks set assignee='$B' where id=$TH" 2>&1 | grep -c 'permission denied')" 1 "표에 직접 쓰기 불가"
ok "$(anon "select public.msg_task_delegate($TH, '$B', '')" | grep -c 'permission denied')" 1 "공개 키는 넘기기 함수 실행 불가"
ok "$(anon "select public.msg_task_defer($TH, now(), '')" | grep -c 'permission denied')" 1 "공개 키는 미루기 함수 실행 불가"

echo "── 결석·지각·이동 = 담당 선생님 확인 (202610200003)"
MK=$(as $C "select (public.msg_send('[결석] 중3 김민준 병결입니다 @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $C "select count(*)||'|'||bool_and(ack_only)||'|'||min(text) from public.msg_tasks where message_id=$MK")" "1|true|[결석] 중3 김민준 병결입니다" "결석 꼬리표 = 확인만 하면 끝"
TK=$(as $C "select id from public.msg_tasks where message_id=$MK")
ok "$(as $B "select (public.msg_task_seen($TK)->>'status')")" "완료" "담당 선생님이 확인을 누르면 완료"
MK2=$(as $B "select (public.msg_send('[지각] 고2 박하늘 10분 지각 @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $B "select count(*) from public.msg_tasks where message_id=$MK2")" 0 "선생님 본인이 올리면 업무 목록에 안 올라감"
MK3=$(as $B "select (public.msg_send('[이동] 고1 이준 금→토 @고희주 @이은지', '[]', array['$C','$B']::uuid[])->'message'->>'id')")
ok "$(as $B "select count(*)||'|'||min(assignee_name)||'|'||bool_and(ack_only) from public.msg_tasks where message_id=$MK3")" "1|고희주|true" "이동도 확인만 · 나는 빼고 다른 사람만"
MK4=$(as $C "select (public.msg_send('[공지] 내일 휴강 @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $C "select bool_and(ack_only) from public.msg_tasks where message_id=$MK4")" "f" "다른 꼬리표는 보통 할 일"
MK5=$(as $C "select (public.msg_send('결석 처리 부탁 [결석] @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $C "select bool_and(ack_only) from public.msg_tasks where message_id=$MK5")" "f" "꼬리표는 맨 앞일 때만"
echo "── 진행 중"
MP=$(as $B "select (public.msg_send('출석부 스캔 @고희주', '[]', array['$C']::uuid[])->'message'->>'id')")
TP=$(as $B "select id from public.msg_tasks where message_id=$MP")
ok "$(as $B "select public.msg_task_progress($TP, true)" | grep -c not_allowed)" 1 "맡긴 사람은 진행 중 표시 못 함(맡은 사람만)"
ok "$(as $C "select (public.msg_task_progress($TP, true)->>'progress_by')||'|'||(select status from public.msg_tasks where id=$TP)")" "고희주|대기" "진행 중 — 상태는 대기 그대로"
ok "$(as $C "select (public.msg_task_progress($TP, true)->'history')::text" | grep -o '진행 중' | wc -l | tr -d ' ')" 1 "같은 값이면 기록을 다시 쌓지 않음"
ok "$(as $C "select (public.msg_task_progress($TP, false)->>'progress_at') is null")" "t" "진행 해제"
ok "$(as $C "select jsonb_array_length(history) from public.msg_tasks where id=$TP")" 2 "기록 두 줄(진행 중·진행 해제)"
as $C "select public.msg_task_progress($TP, true)" >/dev/null
as $C "select public.msg_task_set($TP, true)" >/dev/null
ok "$(as $C "select public.msg_task_progress($TP, false)" | grep -c not_pending)" 1 "끝난 일은 진행 표시를 바꾸지 않음"
ok "$(anon "select public.msg_task_progress($TP, true)" | grep -c 'permission denied')" 1 "공개 키는 진행 중 함수 실행 불가"

echo "── 사용 시간"
psql -X -q -d $DB -c "insert into auth.users values ('99999999-0000-0000-0000-000000000009')" -c "insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values ('99999999-0000-0000-0000-000000000009','parkeh','박언호','teacher',true)" >/dev/null
PK=99999999-0000-0000-0000-000000000009
ok "$(as $C "select public.usage_tick('shueguk-report/timetable.html')")" "t" "1분 기록"
ok "$(as $C "select public.usage_tick('shueguk-report/timetable.html')")" "f" "45초 안에 또 부르면 세지 않음"
ok "$(as $C "select public.usage_tick('shueguk-hub/ops.html')")" "f" "같은 묶음(티쳐스)의 다른 페이지도 한 번만"
ok "$(as $C "select public.usage_tick('shueguk-hub/messenger.html')")" "t" "슈톡은 따로 셈"
psql -X -q -d $DB -c "update public.teacher_usage_last set at = now() - interval '1 minute'" >/dev/null
ok "$(as $C "select public.usage_tick('SHUEGUK-REPORT/timetable.html')")" "t" "1분 지나면 다시 셈(대소문자 무시)"
ok "$(as $C "select public.usage_tick('../etc/passwd')" | grep -c bad_page)" 1 "이상한 페이지 이름 거절"
ok "$(as $E "select public.usage_tick('shueguk-hub/ops.html')")" "f" "계정 없는 로그인은 세지 않음"
ok "$(psql -X -A -t -q -d $DB -c "select string_agg(page||'='||minutes, ',' order by page) from public.teacher_usage where user_id='$C'")" "shueguk-hub/messenger.html=1,shueguk-report/timetable.html=2" "페이지마다 분 수 누적"
ok "$(as $C "select count(*) from public.teacher_usage" | grep -c 'permission denied')" 1 "사용 시간 표는 직접 못 읽음"
D0=$(psql -X -A -t -q -d $DB -c "select (now() at time zone 'Asia/Seoul')::date")
ok "$(as $C "select count(*) from public.staff_usage('$D0', '$D0')" | grep -c not_allowed)" 1 "보통 교사는 강사 관리 사용 시간 못 봄"
ok "$(as $A "select sum(minutes) from public.staff_usage('$D0', '$D0')")" 3 "원장님(관리자)은 봄"
ok "$(as $PK "select count(*) from public.staff_usage('$D0', '$D0')")" 2 "대표님(parkeh)도 봄"
ok "$(as $A "select count(*) from public.staff_usage('$D0', '2020-01-01')" | grep -c bad_range)" 1 "거꾸로 된 기간 거절"
ok "$(anon "select public.usage_tick('shueguk-hub/ops.html')" | grep -c 'permission denied')" 1 "공개 키는 사용 시간 함수 실행 불가"

echo "── @조교 · @선생님"
MG=$(as $B "select (public.msg_send('내일 시험지 배부합니다 @조교들에게', '[]', '{}')->'message'->>'id')")
ok "$(as $B "select string_agg(assignee_name, ',' order by assignee_name)||'|'||bool_and(ack_only)||'|'||min(text) from public.msg_tasks where message_id=$MG")" "고희주|true|내일 시험지 배부합니다" "@조교 = 활성 조교 모두 · 확인만 · 글에서 @조교들에게 뺌"
MT=$(as $C "select (public.msg_send('@선생님 리포트 작성 부탁드립니다', '[]', '{}')->'message'->>'id')")
ok "$(as $C "select string_agg(assignee_name, ',' order by assignee_name)||'|'||bool_and(ack_only)||'|'||min(text) from public.msg_tasks where message_id=$MT")" "박언호,이수경,이은지|true|리포트 작성 부탁드립니다" "@선생님 = 선생님·원장님·대표님(비활성 제외) · 확인만"
MT2=$(as $A "select (public.msg_send('@선생님 회의합니다', '[]', '{}')->'message'->>'id')")
ok "$(as $A "select string_agg(assignee_name, ',' order by assignee_name)||'' from public.msg_tasks where message_id=$MT2")" "박언호,이은지" "@선생님도 보낸 사람(원장님)은 뺌"
MN=$(as $C "select (public.msg_send('@이은지 선생님 확인 부탁드려요', '[]', array['$B']::uuid[])->'message'->>'id')")
ok "$(as $C "select count(*)||'|'||bool_and(ack_only)::text from public.msg_tasks where message_id=$MN")" "1|false" "'@이은지 선생님'은 @선생님이 아님(보통 할 일 한 명)"
echo "── 클로슈 (202610200007)"
MQ=$(as $C "select (public.msg_send('[결석] 중3 민준 결석', '[]', '{}')->'message'->>'id')")
ok "$(as $C "select public.msg_bot_say('note', 'x')" | grep -c 'permission denied')" 1 "교사 화면은 클로슈 이름으로 글을 못 씀"
ok "$(as $C "select 1 from pg_proc where proname in ('msg_bot_ask','msg_bot_post')" | grep -c 1)" 0 "화면이 글을 만들던 함수는 지움"
ok "$(anon "select public.msg_bot_say('note', 'x')" | grep -c 'permission denied')" 1 "공개 키도 클로슈 글 불가"
ok "$(svc "select public.msg_bot_say('ask', '누구?', $MQ, null, '[{\"label\":\"퇴사\",\"uid\":\"$D\"}]')" | grep -c bad_options)" 1 "보기에 비활성 교사 불가"
ok "$(svc "select public.msg_bot_say('answer', '답')" | grep -c need_reply)" 1 "답은 원글이 있어야"
ok "$(svc "select public.msg_bot_say('shout', '답')" | grep -c bad_kind)" 1 "정해진 종류만"
ok "$(svc "select public.msg_bot_say('note', 'x', null, array['$D']::uuid[])" | grep -c bad_person)" 1 "알림 받을 사람은 활성 교사만"
AQ=$(svc "select (public.msg_bot_say('ask', '민준 학생이 두 명이에요. 누구인가요?', $MQ, null, '[{\"label\":\"민준A · 이은지T\",\"uid\":\"$B\"},{\"label\":\"민준B · 원장\",\"uid\":\"$A\"}]', 'ask:$MQ')).id")
ok "$(as $C "select author is null and author_name='클로슈' and bot->>'kind'='ask' and (bot->>'ai')::boolean and reply_to=$MQ and (bot->'to') @> '[\"$B\",\"$A\",\"$C\"]' from public.msg_messages where id=$AQ")" "t" "클로드가 클로슈 이름으로 질문(원글에 답장, 알림은 글쓴이·보기 선생님)"
ok "$(svc "select public.msg_bot_say('ask', 'x', $MQ, null, '[{\"label\":\"a\",\"uid\":\"$B\"}]', 'ask:$MQ')" | grep -c exists)" 1 "같은 열쇠로는 한 번만"
ok "$(as $B "select public.msg_bot_pick($AQ, '$A')" | grep -c not_allowed)" 1 "보기의 다른 선생님 대신 고르기 불가"
ok "$(as $C "select public.msg_bot_pick($AQ, '$C')" | grep -c bad_pick)" 1 "보기에 없는 사람 불가"
ok "$(as $B "select jsonb_array_length(public.msg_bot_pick($AQ, '$B')->'tasks')")" "1" "보기에 있는 선생님 본인이 '내 학생'으로 고름"
ok "$(as $B "select assignee_name||'|'||ack_only||'|'||requester_name||'|'||hand_push||'|'||hand_by from public.msg_tasks where message_id=$MQ")" "이은지|true|고희주|$B|$B" "고른 선생님에게 확인만 할 일 + 넘김 알림 자리"
ok "$(as $C "select bot->'done'->>'to' from public.msg_messages where id=$AQ")" "이은지" "질문에 고른 결과 남김"
ok "$(as $C "select public.msg_bot_pick($AQ, '$A')" | grep -c already)" 1 "이미 고른 질문은 다시 못 고름"
MQ2=$(as $C "select (public.msg_send('[지각] 중3 친구 지각', '[]', '{}')->'message'->>'id')")
AQ2=$(svc "select (public.msg_bot_say('ask', '누구?', $MQ2, null, '[{\"label\":\"이은지T\",\"uid\":\"$B\"}]')).id")
as $C "select public.msg_delete($MQ2)" >/dev/null
ok "$(as $B "select public.msg_bot_pick($AQ2, '$B')" | grep -c msg_deleted)" 1 "지운 원글엔 배정 할 일을 만들지 않음"
ok "$(svc "select public.msg_bot_say('answer', '답', $MQ2)" | grep -c msg_deleted)" 1 "지운 글엔 답하지 않음"
MQ3=$(as $C "select (public.msg_send('[이동] 중3 친구 이동', '[]', '{}')->'message'->>'id')")
AQ3=$(svc "select (public.msg_bot_say('ask', '누구?', $MQ3, null, '[{\"label\":\"이은지T\",\"uid\":\"$B\"}]')).id")
as $A "select public.msg_delete($AQ3)" >/dev/null
ok "$(as $B "select public.msg_bot_pick($AQ3, '$B')" | grep -c msg_deleted)" 1 "지운 배정 질문으로는 고르지 못함"
MA2=$(as $C "select (public.msg_send('@클로슈 김민준 담당이 누구야?', '[]', '{}')->'message'->>'id')")
ok "$(svc "select (public.msg_bot_say('answer', '김민준 · 담당 이은지 선생님', $MA2, array['$C']::uuid[], null, 'answer:$MA2')).author_name")" "클로슈" "@클로슈 질문에 클로드 답"
ok "$(svc "select public.msg_bot_say('answer', '또', $MA2, null, null, 'answer:$MA2')" | grep -c exists)" 1 "질문마다 답 한 번"
ok "$(psql -X -A -t -q -d $DB -c "select bot->'to' from public.msg_messages where reply_to=$MA2 and bot->>'kind'='answer'")" "[\"$C\"]" "답 알림은 물어본 사람에게만"
MA4=$(as $C "select (public.msg_send('@클로슈 오늘 휴강 반 있어?', '[]', '{}')->'message'->>'id')")
ok "$(svc "select (public.msg_bot_say('answer', '없습니다', $MA4, array['$A','$B']::uuid[])).bot->'to'")" "[\"$C\"]" "받는 사람을 다르게 줘도 답은 물어본 사람에게만 (Codex 검토)"
as $A "select public.msg_delete((select id from public.msg_messages where reply_to=$MA2 and bot->>'kind'='answer'))" >/dev/null
ok "$(svc "select (public.msg_bot_say('answer', '다시 답', $MA2, array['$C']::uuid[], null, 'answer:$MA2')).body")" "다시 답" "지운 답의 열쇠는 다시 쓸 수 있음"
ok "$(svc "select public.msg_bot_say('answer', '또또', $MA2, null, null, 'answer:$MA2')" | grep -c exists)" 1 "다시 단 답도 한 번만"
ok "$(as $C "select (bot->'to'->>0)||'|'||(bot->>'ai') from public.msg_messages where reply_to=$MA2 and bot is not null")" "$C|true" "답 알림은 물어본 사람에게만"
MA3=$(as $C "select (public.msg_send('@클로슈 오늘 출근 누구?', '[]', '{}')->'message'->>'id')")
svc "select public.msg_bot_say('note', '약속 알림 같은 다른 글', $MA3)" >/dev/null
ok "$(svc "select string_agg(id::text, ',' order by id) from public.msg_bot_unanswered(50) where id in ($MA2, $MA3)")" "$MA3" "답 안 한 @클로슈만(다른 클로슈 글은 답이 아님)"
ok "$(as $C "select count(*) from public.msg_bot_unanswered(5)" | grep -c 'permission denied')" 1 "교사는 답 안 한 질문 함수를 못 부름"
ok "$(svc "select (public.msg_bot_say('summary', '오늘 정리', null, null, null, 'summary:x')).bot->>'to'")" "" "오늘 정리는 모두에게"
ok "$(svc "select message_id is not null from public.msg_bot_runs where key='summary:x'")" "t" "열쇠에 올린 글 번호를 남김"
MD=$(as $A "select (public.msg_send('교재 주문 @이은지', '[]', array['$B']::uuid[])->'message'->>'id')")
TD=$(as $A "select id from public.msg_tasks where message_id=$MD")
as $B "select public.msg_task_defer($TD, now() + interval '1 hour', '저녁에')" >/dev/null
psql -X -q -d $DB -c "update public.msg_tasks set due_at = now() - interval '5 minutes' where id=$TD" >/dev/null
ok "$(as $C "select jsonb_array_length(public.msg_bot_tick()->'msgs') >= 1")" "t" "약속 지난 할 일에 클로슈 알림"
ok "$(as $C "select (body ~ '^@이은지 약속 시각\(\d+/\d+ 오[전후] \d+:\d\d\)이 지났어요 — 교재 주문 \(저녁에\)$')||'|'||(bot->'to'->>0) from public.msg_messages where bot->>'kind'='due' and (bot->>'task')::bigint=$TD")" "true|$B" "알림 글·받는 사람"
ok "$(as $C "select (public.msg_bot_tick()->'msgs') @> to_jsonb(array[(select id from public.msg_messages where bot->>'kind'='due' and (bot->>'task')::bigint=$TD)])")" "t" "알림을 못 보낸 클로슈 글은 다음 tick에 다시 돌려줌"
ok "$(as $C "select count(*) from public.msg_messages where bot->>'kind'='due' and (bot->>'task')::bigint=$TD")" "1" "같은 약속엔 글 한 번만"
psql -X -q -d $DB -c "update public.msg_messages set pushed_at = now() where bot is not null" >/dev/null
ok "$(as $C "select jsonb_array_length(public.msg_bot_tick()->'msgs')")" "0" "알림을 보낸 글은 다시 돌려주지 않음"
as $B "select public.msg_task_defer($TD, now() + interval '2 hours', '')" >/dev/null
ok "$(as $C "select due_alerted_at is null from public.msg_tasks where id=$TD")" "t" "다시 미루면 알림 자리 비움"
psql -X -q -d $DB -c "update public.msg_tasks set due_at = now() - interval '1 minute' where id=$TD" >/dev/null
ok "$(svc "select coalesce(array_length(public.msg_bot_due(), 1), 0)")" "1" "클로슈 순찰(service_role)도 약속 지남 알림을 만듦"
ok "$(svc "select coalesce(array_length(public.msg_bot_due(), 1), 0)")" "0" "순찰에서도 한 번만"
ok "$(as $C "select public.msg_bot_due()" | grep -c 'permission denied')" 1 "교사는 순찰용 함수를 못 부름"
ok "$(as $E "select public.msg_bot_tick()" | grep -c not_teacher)" 1 "계정 없는 로그인은 못 부름"
ok "$(anon "select public.msg_bot_tick()" | grep -c 'permission denied')" 1 "공개 키는 클로슈 함수 실행 불가"
ok "$(as $C "select count(*) from public.msg_bot_runs" 2>&1 | grep -c 'permission denied')" 1 "중복 방지 표는 직접 못 읽음"

# 카카오채널 문의(202610200009)
SQ(){ psql -X -A -t -q -d $DB -c "$1" 2>&1 | last; }
KM=$(svc "select (public.kakao_inbound('a1b2c3', '내일 김민준 결석합니다')).id")
ok "$(SQ "select author_name||'|'||(author is null)::text||'|'||(bot->>'kind')||'|'||(bot->'to'->>0) from public.msg_messages where id=$KM")" "카카오채널|true|kakao|$A" "카카오채널 글 — 작성자 없음·알림은 관리자"
ok "$(SQ "select count(*)||'|'||min(assignee_name)||'|'||min(requester_name) from public.msg_tasks where message_id=$KM")" "1|이수경|카카오채널" "관리자 업무 카드에 문의 확인 할 일 하나"
ok "$(SQ "select replace(body, chr(10), '/') from public.msg_messages where id=$KM")" "학부모님 문의 (#a1b2c3)/내일 김민준 결석합니다" "본문에 보낸 사람 구분과 글"
ok "$(svc "select replace((public.kakao_inbound('a1b2c3', '')).body, chr(10), '/')")" "학부모님 문의 (#a1b2c3)/(글 없이 보낸 메시지)" "빈 글도 받음"
SQ "insert into public.msg_messages (author, author_name, body, files, bot) select null, '카카오채널', 'x', '[]', '{\"kind\":\"kakao\",\"who\":\"zzzzzz\"}' from generate_series(1,30)" >/dev/null
ok "$(svc "select public.kakao_inbound('zzzzzz', '또')" | grep -c too_many)" 1 "같은 사람은 하루 30개까지"
ok "$(svc "select public.msg_bot_say('note', '받는 사람 없는 알림')" | grep -c need_to)" 1 "원글 없는 note 는 받는 사람이 꼭 있어야 (Codex 검토)"
NQ=$(as $C "select (public.msg_send('교재 주문 누가 해요?', '[]', '{}')->'message'->>'id')")
ok "$(svc "select (public.msg_bot_say('note', '@로 부르면 업무 카드에 올라가요', $NQ)).bot->'to'->>0")" "$C" "받는 사람을 빠뜨린 note 는 원글 쓴 사람에게만"
ok "$(SQ "select count(*) from information_schema.columns where table_name='msg_messages' and column_name='push_retry'")" "1" "일부 실패 기기 목록 열(push_retry)"
SQ "update public.msg_messages set push_retry='[7,9]' where id=$NQ" >/dev/null
ok "$(svc "select public.msg_push_retry_claim($NQ)")" "[7, 9]" "다시 보낼 기기 목록을 비우며 옛 값을 돌려줌 (Codex 검토)"
ok "$(svc "select coalesce(public.msg_push_retry_claim($NQ)::text, 'null')")" "null" "두 번째는 빈 값(한쪽만 잡음)"
ok "$(SQ "select coalesce(push_retry::text, 'null') from public.msg_messages where id=$NQ")" "null" "잡은 뒤 목록은 비워짐"
HT=$(SQ "select id from public.msg_tasks order by id limit 1")
SQ "update public.msg_tasks set hand_retry='{\"to\":\"$B\",\"by\":\"이수경\",\"subs\":[3]}' where id=$HT" >/dev/null
ok "$(svc "select public.msg_hand_retry_claim($HT)->'subs'")" "[3]" "넘김 알림도 일부 실패 기기만 다시 잡음"
SQ "update public.msg_tasks set hand_retry='{\"to\":\"$B\",\"subs\":[3]}', hand_push=null where id=$HT" >/dev/null
SQ "update public.msg_tasks set hand_push='$C' where id=$HT" >/dev/null
ok "$(SQ "select coalesce(hand_retry::text, 'null') from public.msg_tasks where id=$HT")" "null" "다시 넘기면 앞 넘김 재시도 정보는 버림 (Codex 검토)"
G0=$(SQ "select hand_gen from public.msg_tasks where id=$HT")
GA=$(SQ "select assignee from public.msg_tasks where id=$HT"); GX=$C; [ "$GA" = "$C" ] && GX=$B
SQ "update public.msg_tasks set assignee='$GX' where id=$HT" >/dev/null
SQ "update public.msg_tasks set assignee='$GA' where id=$HT" >/dev/null
ok "$(SQ "select hand_gen - $G0 from public.msg_tasks where id=$HT")" "2" "맡은 사람이 바뀔 때마다 위임 세대가 오름 — B→C→B 도 갈림 (Codex 검토)"
SQ "update public.msg_tasks set seen_at=now() where id=$HT" >/dev/null
ok "$(SQ "select hand_gen - $G0 from public.msg_tasks where id=$HT")" "2" "확인 등 다른 변경은 세대를 바꾸지 않음"
ok "$(as $A "select public.msg_push_retry_claim($NQ)" | grep -c 'permission denied')" 1 "교사는 다시 보내기 잡기 함수를 못 부름"
SQ "update public.teacher_accounts set role='teacher' where user_id='$A'" >/dev/null
ok "$(svc "select (public.kakao_inbound('noadm1', '관리자 없음')).bot->>'to'")" "[]" "관리자가 없어도 모두에게 보내지 않음(빈 받는 사람) (Codex 검토)"
SQ "update public.teacher_accounts set role='admin' where user_id='$A'" >/dev/null
ok "$(as $A "select public.kakao_inbound('x', 'y')" | grep -c 'permission denied')" 1 "교사는 카카오 함수를 못 부름"
ok "$(psql -X -A -t -q -d $DB -c "set role anon;" -c "select public.kakao_inbound('x', 'y')" 2>&1 | grep -c 'permission denied')" 1 "공개 키도 못 부름"

echo "── 읽음 숫자 · 공감(하트) (202610200012)"
P -f supabase/migrations/202610200012_messenger_read_heart.sql >/dev/null || { echo "읽음·공감 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200012_messenger_read_heart.sql >/dev/null && ok y y "읽음·공감 마이그레이션 다시 실행해도 오류 없음"
MX=$(SQ "select max(id) from public.msg_messages")
ok "$(SQ "select count(*) from public.msg_reads r join public.teacher_accounts t using (user_id) where t.active and r.last_id=$MX")" "$(SQ "select count(*) from public.teacher_accounts where active")" "처음 적용 때 활성 교사는 지금까지 모두 읽은 것으로"
ok "$(SQ "select count(*) from public.msg_reads where user_id='$D'")" "0" "비활성 교사는 넣지 않음"
SQ "update public.msg_reads set last_id=1 where user_id='$B'" >/dev/null
ok "$(as $B "select public.msg_read_mark(3)")" "3" "읽은 자리 앞으로"
ok "$(as $B "select public.msg_read_mark(2)")" "3" "뒤로는 가지 않음"
ok "$(as $B "select public.msg_read_mark(99999999)")" "$MX" "없는 번호보다 크게는 못 적음"
ok "$(as $C "select count(*) from public.msg_reads")" "$(SQ "select count(*) from public.msg_reads")" "활성 교사는 모든 사람의 읽은 자리를 봄"
ok "$(as $C "insert into public.msg_reads (user_id, last_id) values ('$C', 0) on conflict (user_id) do update set last_id=0" | grep -c 'permission denied')" 1 "표에 직접 쓰지 못함"
ok "$(anon "select public.msg_read_mark(1)" | grep -c 'permission denied')" 1 "공개 키는 읽은 자리를 못 적음"
ok "$(anon "select count(*) from public.msg_reads" | grep -c 'permission denied')" 1 "공개 키는 읽은 자리를 못 봄"
HM=$(as $B "select (public.msg_send('하트 시험', '[]', '{}')->'message'->>'id')")
U0=$(SQ "select updated_at from public.msg_messages where id=$HM")
ok "$(as $C "select (public.msg_heart($HM, true))->'hearts'")" "[\"$C\"]" "공감 누르기"
ok "$(as $C "select jsonb_array_length((public.msg_heart($HM, true))->'hearts')")" "1" "두 번 눌러도 한 번"
ok "$(as $A "select jsonb_array_length((public.msg_heart($HM, true))->'hearts')")" "2" "다른 사람 공감도 더해짐"
ok "$(SQ "select updated_at > '$U0' from public.msg_messages where id=$HM")" "t" "공감하면 updated_at 이 바뀌어 다른 화면도 받음"
ok "$(as $C "select (public.msg_heart($HM, false))->'hearts'")" "[\"$A\"]" "공감 풀기는 내 것만"
ok "$(as $C "update public.msg_messages set hearts='{}' where id=$HM" | grep -c 'permission denied')" 1 "표의 공감 목록을 직접 못 고침"
as $B "select public.msg_delete($HM)" >/dev/null
ok "$(as $A "select public.msg_heart($HM, true)" | grep -c deleted)" 1 "지운 메시지에는 공감 불가"
ok "$(anon "select public.msg_heart($HM, true)" | grep -c 'permission denied')" 1 "공개 키는 공감 불가"

echo "── 내 업무 직접 추가 (202610250002)"
P -f supabase/migrations/202610250002_messenger_self_task.sql >/dev/null || { echo "내 업무 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610250002_messenger_self_task.sql >/dev/null && ok y y "내 업무 마이그레이션 다시 실행해도 오류 없음"
SID=$(as $B "select (public.msg_task_add('  3시까지 시험지 복사  ')).id")
ok "$(P -tAc "select message_id is null, self_added, assignee='$B', requester='$B', text, status from public.msg_tasks where id=$SID")" "t|t|t|t|3시까지 시험지 복사|대기" "메시지 없이 내 카드에만 · 맡은 사람=맡긴 사람=나"
ok "$(as $B "select public.msg_task_add('   ')" | grep -c empty)" 1 "빈 글은 거절"
ok "$(as $B "select public.msg_task_add(repeat('가', 301))" | grep -c too_long)" 1 "300자 넘으면 거절"
ok "$(as $E "select public.msg_task_add('x')" | grep -c not_teacher)" 1 "교사 계정이 아니면 거절"
ok "$(anon "select public.msg_task_add('x')" | grep -c 'permission denied')" 1 "공개 키는 추가 불가"
ok "$(as $B "select public.msg_task_set($SID, true)->>'status'")" "완료" "내 업무 체크"
ok "$(as $B "select public.msg_task_set($SID, false)->>'status'")" "대기" "체크 풀기"
ok "$(as $B "select public.msg_task_cancel($SID, '필요 없어짐')->>'status'")" "취소" "메시지 없는 업무도 취소"

echo "── 클로슈가 올리는 할 일 (202610290001)"
P -f supabase/migrations/202610290001_messenger_bot_task.sql >/dev/null || { echo "클로슈 할 일 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610290001_messenger_bot_task.sql >/dev/null && ok y y "클로슈 할 일 마이그레이션 다시 실행해도 오류 없음"
BT=$(svc "select (public.msg_bot_task('$B', '  솔라피 승인 확인  ', now() + interval '1 day', '알림톡 마무리', 'task:t1')).id")
ok "$(P -tAc "select message_id is null, self_added, assignee='$B', requester='$B', requester_name, text, status, due_at is not null, due_note from public.msg_tasks where id=$BT")" "t|f|t|t|클로슈|솔라피 승인 확인|대기|t|알림톡 마무리" "메시지 없이 그 사람 카드에 · 맡긴 사람 이름 클로슈 · 언제까지"
ok "$(svc "select (public.msg_bot_task('$B', 'x', null, '메모', null)).due_note")" "" "약속 시각이 없으면 메모도 비움"
ok "$(svc "select public.msg_bot_task('$B', 'x', null, '', 'task:t1')" | grep -c exists)" 1 "같은 열쇠는 한 번만"
ok "$(svc "select public.msg_bot_task('$E', 'x')" | grep -c bad_person)" 1 "활성 교사가 아니면 거절"
ok "$(svc "select public.msg_bot_task('$B', '  ')" | grep -c empty)" 1 "빈 글은 거절"
ok "$(svc "select public.msg_bot_task('$B', repeat('가', 301))" | grep -c too_long)" 1 "300자 넘으면 거절"
ok "$(svc "select public.msg_bot_task('$B', 'x', now() - interval '1 minute')" | grep -c past_due)" 1 "지난 시각은 거절"
ok "$(as $A "select public.msg_bot_task('$B', 'x')" | grep -c 'permission denied')" 1 "교사는 실행 불가(service_role만)"
ok "$(anon "select public.msg_bot_task('$B', 'x')" | grep -c 'permission denied')" 1 "공개 키도 실행 불가"
ok "$(as $B "select public.msg_task_set($BT, true)->>'status'")" "완료" "받은 사람이 체크"
ok "$(as $B "select public.msg_task_set($BT, false)->>'status'")" "대기" "체크 풀기"
ok "$(as $B "select public.msg_task_defer($BT, now() + interval '2 day', '내일 못 봄')->>'due_note'")" "내일 못 봄" "받은 사람이 미루기"
ok "$(as $B "select public.msg_task_cancel($BT, '승인 전')->>'status'")" "취소" "받은 사람이 취소"

echo "── 티쳐스 활동 기록·알림 (202610270001)"
P -f supabase/migrations/202610270001_activity_log.sql >/dev/null || { echo "활동 기록 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610270001_activity_log.sql >/dev/null && ok y y "활동 기록 마이그레이션 다시 실행해도 오류 없음"
ok "$(as $B "insert into public.activity_log (what) values ('x')" | grep -c 'permission denied')" 1 "교사는 활동 기록을 직접 못 넣음(함수만)"
ok "$(svc "insert into public.activity_log (page, what, action, target, author, urgent) values ('timetable', '시험 범위', '저장', '고1 화정', '김현지', true) returning id" | grep -c '^[0-9]')" 1 "service_role 은 넣음"
ok "$(as $B "select what||'|'||author||'|'||urgent from public.activity_log")" "시험 범위|김현지|true" "교사는 읽음"
ok "$(anon "select count(*) from public.activity_log" | grep -c 'permission denied')" 1 "공개 키는 못 읽음"
ok "$(as $B "update public.activity_log set author='x'" | grep -c 'permission denied')" 1 "교사는 못 고침"
AM=$(svc "select (public.activity_say('[시험 범위] 김현지 · 저장', array['$A'::uuid])).id")
ok "$(P -tAc "select author is null, author_name, bot->>'kind', bot->'to'->>0, body from public.msg_messages where id=$AM")" "t|활동 알림|activity|$A|[시험 범위] 김현지 · 저장" "활동 알림 글 = 작성자 없음 · '활동 알림' · bot.kind activity · 받을 사람"
ok "$(as $B "select public.activity_say('x', null)" | grep -c 'permission denied')" 1 "교사는 활동 알림 글을 못 올림"
ok "$(svc "select public.activity_say('  ', null)" | grep -c empty)" 1 "빈 글 거절"
ok "$(as $B "select count(*) from public.msg_messages where id=$AM")" 1 "활성 교사는 활동 알림 글을 읽을 수 있다(슈톡 대화에 보임)"

echo "── 활동 알림을 슈톡 밖으로 — 원장님만 (202610290001)"
P -f supabase/migrations/202610290001_activity_private.sql >/dev/null || { echo "활동 알림 분리 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610290001_activity_private.sql >/dev/null && ok y y "활동 알림 분리 마이그레이션 다시 실행해도 오류 없음"
ok "$(P -tAc "select string_agg(column_name, ',') from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name in ('message_id','notice_id')")" "notice_id" "message_id → notice_id"
ok "$(as $B "select count(*) from public.activity_log")" 0 "선생님은 활동 기록 0줄(원장님만)"
ok "$(as $A "select what||'|'||author from public.activity_log")" "시험 범위|김현지" "원장님은 활동 기록을 읽음"
ok "$(anon "select count(*) from public.activity_log" | grep -c 'permission denied')" 1 "공개 키는 여전히 못 읽음"
ok "$(as $B "select public.activity_say('x', null)" | grep -c 'does not exist')" 1 "activity_say(슈톡 글)는 없어짐"
AN=$(svc "insert into public.activity_notices (kind, text) values ('즉시', '[시험 범위] 김현지 · 저장') returning id")
ok "$(echo $AN | grep -c '^[0-9]')" 1 "service_role 은 알림 글을 넣음"
ok "$(as $A "select kind||'|'||text||'|'||coalesce(pushed_at::text,'-') from public.activity_notices where id=$AN")" "즉시|[시험 범위] 김현지 · 저장|-" "원장님은 알림 글을 읽음(아직 안 보냄)"
ok "$(as $B "select count(*) from public.activity_notices")" 0 "선생님은 알림 글 0줄"
ok "$(anon "select count(*) from public.activity_notices" | grep -c 'permission denied')" 1 "공개 키는 알림 글을 못 읽음"
ok "$(as $A "insert into public.activity_notices (text) values ('x')" | grep -c 'permission denied')" 1 "원장님도 직접 못 넣음(함수만)"
ok "$(svc "insert into public.activity_notices (kind, text) values ('기타', 'x')" | grep -c 'check')" 1 "종류는 즉시·요약만"
ok "$(as $A "select count(*) from public.msg_messages where bot->>'kind'='activity'")" 1 "그전에 올라간 슈톡 활동 알림 글은 그대로(기록)"

echo "── 메시지 수정 (202610290002)"
P -f supabase/migrations/202610290002_messenger_edit.sql >/dev/null || { echo "메시지 수정 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610290002_messenger_edit.sql >/dev/null && ok y y "메시지 수정 마이그레이션 다시 실행해도 오류 없음"
EM=$(as $B "select (public.msg_send('[결석] 중3 김민준 결석입니다 @고희주 조교', '[]', array['$C']::uuid[])->'message'->>'id')")
ET=$(as $B "select id from public.msg_tasks where message_id=$EM")
ok "$(as $C "select public.msg_edit($EM, '남이 고침')" | grep -c not_allowed)" 1 "남의 글은 못 고침"
ok "$(as $A "select public.msg_edit($EM, '관리자가 고침')" | grep -c not_allowed)" 1 "관리자도 남의 글은 못 고침"
ok "$(as $E "select public.msg_edit($EM, 'x')" | grep -c not_teacher)" 1 "계정 없는 로그인은 못 고침"
ok "$(anon "select public.msg_edit($EM, 'x')" | grep -c 'permission denied')" 1 "공개 키는 함수 실행 불가"
ok "$(as $B "select public.msg_edit($EM, '   ')" | grep -c empty)" 1 "빈 글로는 못 고침"
ok "$(as $B "select public.msg_edit($EM, repeat('가', 4001))" | grep -c too_long)" 1 "4,000자 넘으면 거절"
ok "$(as $B "select public.msg_edit(999999, 'x')" | grep -c not_found)" 1 "없는 메시지"
ok "$(as $B "select (public.msg_edit($EM, '[결석] 중3 김민준 결석입니다 @고희주 조교')->'message'->>'edited_at') is null")" "t" "바뀐 게 없으면 edited_at 그대로"
ER=$(as $B "select public.msg_edit($EM, '[결석] 중3 김민준 내일 결석입니다 @고희주 조교')")
ok "$(echo "$ER" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['message']['body'],d['message']['edited_at'] is not None,d['message']['deleted_at'],d['message']['author_name'],d['tasks'][0]['text'],sep='|')")" "[결석] 중3 김민준 내일 결석입니다 @고희주 조교|True|None|이은지|[결석] 중3 김민준 내일 결석입니다" "글·edited_at 바뀜 · 작성자 그대로 · 대기 중 할 일 글도 새 글에 맞춤(@이름·조교 뺌)"
ok "$(as $C "select text||'|'||status||'|'||(updated_at > created_at) from public.msg_tasks where id=$ET")" "[결석] 중3 김민준 내일 결석입니다|대기|true" "할 일 줄 글·updated_at 갱신(화면 폴링이 받음)"
ok "$(as $B "select updated_at = edited_at from public.msg_messages where id=$EM")" "t" "updated_at 도 바뀜(다른 화면 폴링)"
as $C "select public.msg_task_set($ET, true)" >/dev/null
as $B "select public.msg_edit($EM, '[결석] 중3 김민준 모레 결석입니다 @고희주 조교')" >/dev/null
ok "$(as $C "select text from public.msg_tasks where id=$ET")" "[결석] 중3 김민준 내일 결석입니다" "끝난(완료) 할 일 글은 그대로"
ok "$(as $B "select public.msg_edit($EM, '@고희주')->'tasks'->0->>'text'")" "[결석] 중3 김민준 내일 결석입니다" "완료된 할 일은 새 글로 바뀌지 않음(이름만 남은 글도)"
EF=$(as $B "select (public.msg_send('', '$F', array['$C']::uuid[])->'message'->>'id')")
ok "$(as $B "select (public.msg_edit($EF, '')->'message'->>'body')||'|'||(public.msg_edit($EF, '')->'message'->'files'->0->>'name')")" "|시험지.pdf" "파일만 있는 글은 빈 글로 고쳐도 되고 파일은 그대로"
ok "$(as $B "select public.msg_edit($EF, '파일 봐 주세요 @고희주')->'tasks'->0->>'text'")" "파일 봐 주세요" "파일 글의 할 일도 새 글로"
ok "$(as $B "select public.msg_edit($EF, '@고희주')->'tasks'->0->>'text'")" "파일 확인" "이름만 남으면 '파일 확인'"
as $B "select public.msg_delete($EM)" >/dev/null
ok "$(as $B "select public.msg_edit($EM, 'x')" | grep -c msg_deleted)" 1 "지운 글은 못 고침"
ok "$(as $A "select public.msg_edit($AM, '활동 알림 고침')" | grep -c not_allowed)" 1 "작성자 없는 글(활동 알림·클로슈)은 못 고침"
ok "$(as $B "update public.msg_messages set body='직접' where id=$EF" | grep -c 'permission denied')" 1 "표에 직접 고치기 불가"

echo "── 쪽지 보내기 (202610290003)"
P -f supabase/migrations/202610290003_messenger_note.sql >/dev/null || { echo "쪽지 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610290003_messenger_note.sql >/dev/null && ok y y "쪽지 마이그레이션 다시 실행해도 오류 없음"
NM0=$(as $A "select count(*) from public.msg_messages")
ok "$(as $A "select count(*) from public.msg_note_send(array['$B','$C','$B','$D','$A']::uuid[], '내일 3시 회의실 예약 부탁드립니다')")" 2 "쪽지 = 받는 사람마다 한 줄(중복·비활성·본인 제외)"
NT=$(as $A "select id from public.msg_tasks where note and assignee='$C' order by id desc limit 1")
ok "$(as $C "select assignee_name||'|'||requester_name||'|'||status||'|'||ack_only||'|'||note||'|'||coalesce(message_id::text,'null')||'|'||text from public.msg_tasks where id=$NT")" "고희주|이수경|대기|true|true|null|내일 3시 회의실 예약 부탁드립니다" "맡은 사람=받는 사람 · 맡긴 사람=보낸 사람 · 확인만 · 메시지 없음"
ok "$(as $C "select (hand_push='$C')||'|'||(hand_by='$A') from public.msg_tasks where id=$NT")" "true|true" "휴대폰 알림 자리(hand_push·hand_by)를 채움"
ok "$(as $A "select count(*) from public.msg_messages")" "$NM0" "대화에는 글이 남지 않음"
ok "$(as $B "select public.msg_task_seen($NT)" | grep -c not_allowed)" 1 "남이 대신 확인 불가"
ok "$(as $C "select public.msg_task_seen($NT)->>'status'")" "완료" "받은 사람이 [확인]하면 완료"
ok "$(as $C "select done_by_name from public.msg_tasks where id=$NT")" "고희주" "완료한 사람 기록"
ok "$(as $A "select public.msg_note_send(array['$B']::uuid[], '   ')" | grep -c empty)" 1 "빈 쪽지 거절"
ok "$(as $A "select public.msg_note_send(array['$B']::uuid[], repeat('가', 501))" | grep -c too_long)" 1 "500자 넘으면 거절"
ok "$(as $A "select public.msg_note_send(array['$A','$D']::uuid[], 'x')" | grep -c no_recipient)" 1 "본인·비활성만 고르면 거절"
ok "$(as $A "select public.msg_note_send('{}'::uuid[], 'x')" | grep -c no_recipient)" 1 "받는 사람이 없으면 거절"
ok "$(as $E "select public.msg_note_send(array['$B']::uuid[], 'x')" | grep -c not_teacher)" 1 "계정 없는 로그인은 못 보냄"
ok "$(anon "select public.msg_note_send(array['$B']::uuid[], 'x')" | grep -c 'permission denied')" 1 "공개 키는 함수 실행 불가"
NT2=$(as $A "select id from public.msg_tasks where note and assignee='$B' order by id desc limit 1")
ok "$(as $B "select public.msg_task_delegate($NT2, '$C', '')" | grep -c ack_only)" 1 "쪽지는 넘기지 못함(확인만)"
ok "$(as $B "select public.msg_task_cancel($NT2, '잘못 보냄')" | grep -c not_allowed)" 1 "받은 사람은 쪽지를 취소 못 함(보낸 사람·관리자만)"
ok "$(as $A "select public.msg_task_cancel($NT2, '잘못 보냄')->>'status'")" "취소" "보낸 사람은 취소"
ok "$(as $C "insert into public.msg_tasks (assignee, assignee_name, requester, requester_name, text, note) values ('$B','이은지','$C','고희주','직접','t')" | grep -c 'permission denied')" 1 "표에 직접 쪽지 못 넣음(함수만)"

echo "통과 $pass · 실패 $fail"
psql -q -d postgres -c "drop database if exists $DB" >/dev/null
[ $fail -eq 0 ]
