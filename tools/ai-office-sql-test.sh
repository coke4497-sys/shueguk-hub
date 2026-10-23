#!/usr/bin/env bash
# 슈국 AI 교무실 마이그레이션(202610230001_ai_office.sql) 로컬 PostgreSQL 검사
#   PGHOST=/home/pgtest PGPORT=5499 PGUSER=postgres bash tools/ai-office-sql-test.sh
# 새 데이터베이스(aitest)에 auth 흉내 → 교사 계정 → 슈톡(msg_me) → 강사 관리(staff_viewer) → AI 교무실을 적용하고
# 보는 사람·지시·할 일·원장님 확인·순찰 함수를 검사한다. 원격 수파베이스에는 절대 돌리지 말 것.
set -u
cd "$(dirname "$0")/.."
DB=aitest
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
for m in 202609290001_teacher_accounts 202609290003_teacher_admin 202609290004_teacher_assistant_role 202610190001_messenger 202610200005_staff_manage; do
  P -f supabase/migrations/$m.sql >/dev/null || { echo "앞 마이그레이션 실패 $m"; exit 1; }
done
P -f supabase/migrations/202610230001_ai_office.sql >/dev/null || { echo "AI 교무실 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610230001_ai_office.sql >/dev/null && ok y y "다시 실행해도 오류 없음"

A=aaaaaaaa-0000-0000-0000-000000000001   # 원장(admin)
K=99999999-0000-0000-0000-000000000009   # 박언호 대표님(teacher, parkeh)
B=bbbbbbbb-0000-0000-0000-000000000002   # 이은지 선생님
C=cccccccc-0000-0000-0000-000000000003   # 고희주 조교
P >/dev/null <<SQL
insert into auth.users values ('$A'),('$K'),('$B'),('$C');
insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values
 ('$A','admin','이수경','admin',true), ('$K','parkeh','박언호','teacher',true),
 ('$B','eunji','이은지','teacher',true), ('$C','heeju','고희주','assistant',true);
SQL

last(){ local o; o=$(cat); if grep -q 'ERROR' <<<"$o"; then grep -m1 'ERROR' <<<"$o"; else tail -n 1 <<<"$o"; fi; }
as(){ local uid=$1; shift; psql -X -A -t -q -d $DB -c "set role authenticated; set request.jwt.claim.sub='$uid';" -c "$1" 2>&1 | last; }
svc(){ psql -X -A -t -q -d $DB -c "set role service_role;" -c "$1" 2>&1 | last; }
anon(){ psql -X -A -t -q -d $DB -c "set role anon;" -c "$1" 2>&1 | last; }
has(){ grep -c "$1" <<<"$2"; }

echo "── 지시"
ok "$(as $A "select id from public.ai_order_add('예비 고1 설명회 카드뉴스 3장 문구', 'hong')")" 1 "원장님 지시 남기기"
ok "$(as $K "select author_name||'|'||to_role||'|'||status from public.ai_order_add('10월 회차 초과 학생 정리')")" "박언호|lead|접수" "대표님도 지시(기본 = 팀장), 이름은 서버가"
ok "$(has not_allowed "$(as $B "select public.ai_order_add('몰래 지시')")")" 1 "선생님은 지시 못 함"
ok "$(has not_allowed "$(as $C "select public.ai_order_add('몰래 지시')")")" 1 "조교도 못 함"
ok "$(has empty "$(as $A "select public.ai_order_add('   ')")")" 1 "빈 지시 거절"
ok "$(has bad_role "$(as $A "select public.ai_order_add('x', 'app')")")" 1 "없는 조교 거절"
ok "$(has 'permission denied' "$(anon "select public.ai_order_add('x')")")" 1 "공개 키는 함수 실행 불가"

echo "── 읽기"
ok "$(as $A "select count(*) from public.ai_orders")" 2 "원장님은 지시를 읽음"
ok "$(as $K "select count(*) from public.ai_orders")" 2 "대표님도 읽음"
ok "$(as $B "select count(*) from public.ai_orders")" 0 "선생님에게는 0줄"
ok "$(has 'permission denied' "$(anon "select count(*) from public.ai_orders")")" 1 "공개 키는 표를 못 읽음"
ok "$(has 'permission denied' "$(as $A "insert into public.ai_orders (body) values ('직접')")")" 1 "표에 직접 쓰기는 막힘"
ok "$(has 'permission denied' "$(as $A "update public.ai_tasks set col='완료'")")" 1 "할 일 직접 고치기도 막힘"

echo "── 취소"
ok "$(as $A "select (public.ai_order_add('잘못 쓴 지시')).id")" 3 "세 번째 지시"
ok "$(as $A "select public.ai_order_cancel(3)")" t "가져가기 전 지시는 취소"
ok "$(has not_open "$(as $A "select public.ai_order_cancel(3)")")" 1 "이미 취소한 지시는 다시 못 함"

echo "── 순찰(service_role)"
ok "$(has 'permission denied' "$(as $A "select public.ai_bot_claim(1)")")" 1 "교사 신분은 순찰 함수 실행 불가"
ok "$(svc "select status from public.ai_bot_claim(1)")" 진행 "순찰이 지시를 가져감"
ok "$(svc "select coalesce((public.ai_bot_claim(1)).id::text, 'null')")" null "겹친 순찰은 같은 지시를 못 가져감"
ok "$(svc "select coalesce((public.ai_bot_claim(3)).id::text, 'null')")" null "취소한 지시는 못 가져감"
ok "$(has not_open "$(as $A "select public.ai_order_cancel(1)")")" 1 "가져간 지시는 화면에서 취소 못 함"
ok "$(svc "select id||'|'||col||'|'||stage from public.ai_bot_task(null, 1, 'hong', '카드뉴스 3장 문구', null, 1, '자료 모으는 중', null, null, '설명회 날짜 확인')")" "1|진행|1" "할 일 만들기"
ok "$(svc "select jsonb_array_length(log) from public.ai_tasks where id=1")" 2 "기록 = 맡김 + 첫 기록"
ok "$(svc "select log->0->>'who'||'|'||(log->1->>'who') from public.ai_tasks where id=1")" "팀장 슈콩|홍보 조교" "기록에 누가 했는지"
ok "$(has bad_col "$(svc "select public.ai_bot_task(1, null, null, null, '완료', null, null, null, null, null)")")" 1 "순찰은 완료로 못 옮김"
ok "$(has bad_stage "$(svc "select public.ai_bot_task(1, null, null, null, null, 5, null, null, null, null)")")" 1 "단계 5(확인 끝)는 못 씀"
ok "$(has order_closed "$(svc "select public.ai_bot_task(null, 3, 'gyo', 'x', null, null, null, null, null, null)")")" 1 "취소한 지시에는 할 일을 못 만듦"
ok "$(svc "select col||'|'||stage||'|'||result||'|'||title from public.ai_bot_task(1, null, null, null, '확인', 4, '3장 완성', '1장: 표지…', 'https://example.com/a', '초안 완성')")" "확인|4|1장: 표지…|카드뉴스 3장 문구" "고치기 — 원장님 확인 칸으로(제목은 그대로)"
ok "$(svc "select public.ai_bot_release(1)")" t "순찰 마침"
ok "$(as $A "select (picked_at is null)::text||'|'||(select (at is not null)::text from public.ai_meta where key='patrol') from public.ai_orders where id=1")" "true|true" "가져간 표시 풀림 + 마지막 순찰 시각"
svc "select public.ai_bot_task(null, 1, 'gum', '카드뉴스 맞춤법 확인', '검수', 3, null, null, null, null)" >/dev/null

echo "── 원장님 확인"
ok "$(has not_allowed "$(as $B "select public.ai_task_decide(1, true)")")" 1 "선생님은 승인 못 함"
ok "$(has need_note "$(as $A "select public.ai_task_decide(1, false, ' ')")")" 1 "다시 고쳐 줘는 의견 필수"
ok "$(as $A "select col||'|'||stage||'|'||last from public.ai_task_decide(1, false, '날짜를 11/8(토)로')")" "진행|2|원장님 의견: 날짜를 11/8(토)로" "다시 고쳐 줘 → 진행·초안 단계"
ok "$(as $A "select status||'|'||(picked_at is null) from public.ai_orders where id=1")" "진행|true" "지시는 다시 진행 · 다음 순찰이 가져갈 수 있음"
ok "$(has not_waiting "$(as $A "select public.ai_task_decide(1, true)")")" 1 "확인 칸이 아니면 승인 못 함"
svc "select public.ai_bot_task(1, null, null, null, '확인', 4, '날짜 고침', null, null, '의견 반영')" >/dev/null
ok "$(as $K "select col||'|'||stage||'|'||decided_by_name from public.ai_task_decide(1, true)")" "완료|5|박언호" "대표님 승인 → 완료"
ok "$(as $A "select status from public.ai_orders where id=1")" 진행 "남은 할 일(검수)이 있으면 지시는 진행"
ok "$(as $A "select col from public.ai_task_stop(2, '이번엔 필요 없음')")" 중단 "남은 할 일 그만두기"
ok "$(as $A "select status from public.ai_orders where id=1")" 완료 "모든 할 일이 끝나면 지시도 완료"
ok "$(has not_open "$(as $A "select public.ai_task_stop(1)")")" 1 "완료한 할 일은 그만둘 수 없음"
ok "$(has closed "$(svc "select public.ai_bot_task(1, null, null, null, '진행', null, null, null, null, null)")")" 1 "순찰은 끝난 할 일을 못 고침"
ok "$(has order_closed "$(svc "select public.ai_bot_task(null, 1, 'gyo', '더', null, null, null, null, null, null)")")" 1 "끝난 지시에는 할 일을 못 더함"

echo "── 50분 지난 가져가기"
svc "select public.ai_bot_claim(2)" >/dev/null
psql -X -q -d $DB -c "update public.ai_orders set picked_at = now() - interval '51 minutes' where id=2" >/dev/null
ok "$(svc "select id from public.ai_bot_claim(2)")" 2 "멈춘 순찰의 지시는 50분 뒤 다시 가져감"

echo "── 기록 40개까지"
for i in $(seq 1 45); do svc "select public.ai_bot_task(null, 2, 'haeng', 't$i', null, null, null, null, null, null)" >/dev/null; break; done
for i in $(seq 1 45); do svc "select 1 from public.ai_bot_task(3, null, null, null, null, null, null, null, null, 'n$i')" >/dev/null; done
ok "$(svc "select jsonb_array_length(log)||'|'||(log->-1->>'text') from public.ai_tasks where id=3")" "40|n45" "기록은 최근 40개만, 순서 유지"

echo
echo "결과: 통과 $pass · 실패 $fail"
[ $fail -eq 0 ]
