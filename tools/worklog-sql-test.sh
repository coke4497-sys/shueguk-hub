#!/usr/bin/env bash
# 조교 근무 일지 마이그레이션(202610200001_work_log.sql) 로컬 PostgreSQL 검사
#   PGHOST=/home/pgtest PGPORT=5499 PGUSER=postgres bash tools/worklog-sql-test.sh
# 원격 수파베이스에는 절대 돌리지 말 것. 시계는 실제 시각(한국 23시 이후에는 '일찍 출근' 검사가 건너뛰어진다).
set -u
cd "$(dirname "$0")/.."
DB=worktest
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
for f in 202609290001_teacher_accounts 202609290003_teacher_admin 202609290004_teacher_assistant_role 202610190001_messenger 202610190002_messenger_push 202610190003_teacher_unique_name 202610190004_messenger_presence; do
  P -f supabase/migrations/$f.sql >/dev/null || { echo "$f 실패"; exit 1; }
done
P -f supabase/migrations/202610200001_work_log.sql >/dev/null || { echo "근무 일지 마이그레이션 실패"; exit 1; }
P -f supabase/migrations/202610200001_work_log.sql >/dev/null && ok y y "다시 실행해도 오류 없음"

A=aaaaaaaa-0000-0000-0000-000000000001   # 원장(admin) 이수경
K=aaaaaaaa-0000-0000-0000-00000000000b   # 박언호 대표님(parkeh, teacher)
B=bbbbbbbb-0000-0000-0000-000000000002   # 이은지 선생님(근무 일지 밖)
C=cccccccc-0000-0000-0000-000000000003   # 고희주 조교
D=dddddddd-0000-0000-0000-000000000004   # 조수민 조교
P >/dev/null <<SQL
insert into auth.users values ('$A'),('$K'),('$B'),('$C'),('$D');
insert into public.teacher_accounts (user_id, login_id, display_name, role, active) values
 ('$A','admin','이수경','admin',true), ('$K','parkeh','박언호','teacher',true), ('$B','eunji','이은지','teacher',true),
 ('$C','heeju','고희주','assistant',true), ('$D','sumin','조수민','assistant',true);
SQL
P -f "supabase/근무일지-초기값.sql" > /tmp/worklog-seed.out || { echo "초기값 실패"; exit 1; }
ok "$(P -tAc "select count(*) from public.work_staff")" "2" "초기값: 계정 있는 두 사람만 시급이 들어감"
ok "$(P -tAc "select wage from public.work_staff where user_id='$C'")" "12000" "고희주 시급 12,000"
ok "$(P -tAc "select count(*) from public.work_roster")" "4" "초기값 근무표: 고희주 2칸 + 조수민 2칸"
ok "$(P -tAc "select start_hm||'-'||end_hm from public.work_roster where dow=5 and loc='본원' and slot=2")" "16:00-22:00" "금 본원 자리 2 = 조수민 16:00~22:00"
grep -q '김영훈' /tmp/worklog-seed.out && ok y y "못 찾은 이름을 알려 줌" || ok n y "못 찾은 이름을 알려 줌"

as(){ local u=$1; shift; local o; o=$(psql -q -X -tA -v ON_ERROR_STOP=1 -d $DB -c "set role authenticated; select set_config('request.jwt.claim.sub', '$u', false);" -c "$*" 2>&1); if echo "$o" | grep -q ERROR; then echo "$o" | grep ERROR | head -1; else echo "$o" | tail -n 1; fi; }

echo "· 시급 읽기"
ok "$(as $A "select count(*) from public.work_staff")" "2" "원장님은 모두의 시급"
ok "$(as $K "select count(*) from public.work_staff")" "2" "박언호 대표님도 모두의 시급"
ok "$(as $C "select count(*) from public.work_staff")" "1" "조교는 자기 시급만"
ok "$(as $C "select wage from public.work_staff")" "12000" "고희주는 자기 시급"
ok "$(as $B "select count(*) from public.work_staff")" "0" "근무 일지 밖 선생님은 0줄"
ok "$(as $C "select count(*) from public.work_staff_list()")" "2" "사람 목록(시급 없이)은 모두 읽음"
ok "$(as $C "select (public.work_me())->>'viewer'")" "false" "조교 viewer=false"
ok "$(as $K "select (public.work_me())->>'viewer'")" "true" "대표님 viewer=true"
ok "$(as $C "select public.work_staff_set('$C', 99999, true)" | grep -c not_allowed)" "1" "조교는 시급을 못 바꿈"
ok "$(as $A "select public.work_staff_set('$B', 13000, true); select count(*) from public.work_staff")" "3" "원장님이 사람 추가"
psql -q -d $DB -c "delete from public.work_staff where user_id='$B'" >/dev/null
ok "$(psql -q -X -tA -d $DB -c "set role anon; select count(*) from public.work_records" 2>&1 | grep -c 'permission denied')" "1" "공개 키로는 기록을 못 읽음"

echo "· 근무표 만들기·교체"
T=$(P -tAc "select private.work_today()")
DOW=$(P -tAc "select extract(isodow from private.work_today())::int")
NEXT=$(P -tAc "select private.work_today() + 7")
P >/dev/null -c "insert into public.work_roster (dow, loc, slot, user_id, start_hm, end_hm) values ($DOW, '화정센터', 1, '$C', '00:00', '23:59') on conflict (dow, loc, slot) do update set user_id=excluded.user_id, start_hm='00:00'"
as $C "select public.work_ensure('$T'::date, '$T'::date + 13)" >/dev/null
ok "$(P -tAc "select count(*) from public.work_shifts where ymd='$T' and user_id='$C'")" "1" "오늘 근무표가 기본 근무표로 채워짐"
ok "$(as $C "select count(*) from public.work_shifts where ymd between '$T' and '$T'::date + 13")" "$(P -tAc "select count(*) from public.work_shifts")" "2주 칸이 만들어지고 조교가 읽음"
ok "$(as $C "select public.work_ensure('$T'::date - 30, '$T'::date - 1); select count(*) from public.work_shifts where ymd < '$T'")" "0" "지난 날은 새로 만들지 않음"
SID=$(P -tAc "select id from public.work_shifts where ymd='$NEXT' and user_id='$C' limit 1")
ok "$(as $D "select (public.work_swap($SID, '$D', '병원')->>'user_id')")" "$D" "조교끼리 교체(조수민이 고희주 칸을 받음)"
ok "$(P -tAc "select orig_user_id||'|'||swap_reason||'|'||swapped_by_name from public.work_shifts where id=$SID")" "$C|병원|조수민" "원래 근무자·사유·바꾼 사람이 남음"
ok "$(as $D "select (public.work_swap($SID, '$B', ''))->>'user_id'" | grep -c bad_user)" "1" "근무 일지 밖 사람으로는 못 바꿈"
ok "$(as $C "select (public.work_swap($SID, '$C', '')->>'orig_user_id') is null")" "t" "원래 근무자로 되돌리면 교체 기록이 지워짐"
ok "$(as $C "select (public.work_swap($SID, null, '추석')->>'user_id') is null")" "t" "이 날 근무 없음"
ok "$(as $B "select (public.work_swap($SID, '$D', '대타')->>'user_id')")" "$D" "선생님도 교체할 수 있음"
ok "$(as $C "select public.work_roster_save('[]'::jsonb, '$T'::date + 1)" | grep -c not_allowed)" "1" "조교는 기본 근무표를 못 바꿈"
RJ="[{\"dow\":$DOW,\"loc\":\"본원\",\"slot\":1,\"user_id\":\"$D\",\"start_hm\":\"16:00\",\"end_hm\":\"22:00\"}]"
ok "$(as $A "select public.work_roster_save('$RJ'::jsonb, '$T'::date + 1)")" "1" "원장님이 기본 근무표 저장"
ok "$(P -tAc "select count(*) from public.work_shifts where ymd > '$T' and swapped_at is null and user_id='$C'")" "0" "앞날의 교체 안 한 칸이 새 근무표로 바뀜"
ok "$(P -tAc "select user_id from public.work_shifts where id=$SID")" "$D" "교체한 칸은 그대로"
ok "$(P -tAc "select count(*) from public.work_shifts where ymd='$T' and user_id='$C'")" "1" "오늘 칸은 그대로(내일부터 적용)"
ok "$(as $A "select public.work_roster_save('[]'::jsonb, '$T'::date - 1)" | grep -c bad_from)" "1" "지난 날부터는 못 바꿈"

echo "· 슈톡 출근·퇴근 → 근무 기록"
P >/dev/null -c "update public.work_shifts set start_hm='00:00' where ymd='$T' and user_id='$C'"
R=$(as $C "select (public.msg_presence_set('화정센터', true))->'work'->>'clipped'")
ok "$R" "false" "근무표 시작보다 늦게 출근 — 누른 시각부터"
ok "$(P -tAc "select count(*) from public.work_records where user_id='$C' and ymd='$T' and out_at is null and start_at=in_at")" "1" "근무 기록이 열림"
ok "$(as $C "select (public.msg_presence_set('본원', true))->>'work' is null")" "t" "센터만 바꾸면 기록을 새로 열지 않음"
ok "$(P -tAc "select count(*) from public.work_records where user_id='$C'")" "1" "기록은 하나"
ok "$(as $C "select (public.msg_presence_set('', false))->'work'->>'event'")" "out" "퇴근하면 기록이 닫힘"
ok "$(P -tAc "select count(*) from public.work_records where user_id='$C' and out_at is not null")" "1" "퇴근 시각이 남음"
ok "$(as $B "select (public.msg_presence_set('본원', true))->>'work' is null")" "t" "근무 일지 밖 선생님은 기록 없음"
ok "$(P -tAc "select count(*) from public.work_records where user_id='$B'")" "0" "선생님 기록 0"
HM=$(P -tAc "select to_char((now() at time zone 'Asia/Seoul') + interval '1 hour', 'HH24:MI') > to_char(now() at time zone 'Asia/Seoul', 'HH24:MI')")
if [ "$HM" = "t" ]; then
  LATER=$(P -tAc "select to_char((now() at time zone 'Asia/Seoul') + interval '1 hour', 'HH24:MI')")
  P >/dev/null -c "insert into public.work_shifts (ymd, loc, slot, user_id, start_hm, end_hm) values ('$T', '민초센터', 3, '$D', '$LATER', '23:59') on conflict (ymd, loc, slot) do update set user_id='$D', start_hm='$LATER'"
  W=$(as $D "select (public.msg_presence_set('민초센터', true))->'work'")
  ok "$(echo "$W" | grep -c '"clipped": true')" "1" "일찍 출근하면 clipped=true"
  ok "$(echo "$W" | grep -c "\"start\": \"$LATER\"")" "1" "근무 시작 = 근무표 시작($LATER)"
  ok "$(P -tAc "select to_char(start_at at time zone 'Asia/Seoul','HH24:MI') from public.work_records where user_id='$D' and ymd='$T'")" "$LATER" "start_at이 근무표 시작"
else
  echo "  - 한국 23시 이후라 '일찍 출근' 검사는 건너뜀"
fi

echo "· 시각 고치기"
RID=$(P -tAc "select id from public.work_records where user_id='$C' limit 1")
ok "$(as $C "select public.work_fix($RID, null, null, '', '16:00', '22:00', '')" | grep -c need_reason)" "1" "이유 없이는 못 고침"
ok "$(as $D "select public.work_fix($RID, null, null, '', '16:00', '22:00', '대신')" | grep -c not_allowed)" "1" "다른 조교 기록은 못 고침"
ok "$(as $C "select (public.work_fix($RID, null, null, '', '00:10', '02:00', '퇴근 버튼'))->>'fixed'")" "true" "본인이 고침"
ok "$(P -tAc "select (orig_in_at is not null)::text||fixed_by_name from public.work_records where id=$RID")" "true고희주" "원래 시각·고친 사람이 남음"
ok "$(as $C "select public.work_fix($RID, null, null, '', '05:00', '04:00', 'x')" | grep -c bad_order)" "1" "퇴근이 출근보다 이르면 거절"
ok "$(as $A "select (public.work_fix(null, '$D', '$T'::date - 2, '본원', '16:00', '22:00', '출근 못 누름'))->>'loc'")" "본원" "원장님이 빠진 날 기록을 새로 넣음"
ok "$(as $D "select public.work_fix(null, '$D', '$T'::date + 1, '본원', '16:00', '22:00', 'x')" | grep -c future)" "1" "앞날 기록은 못 넣음"
P >/dev/null -c "insert into public.work_shifts (ymd, loc, slot, user_id, start_hm, end_hm) values ('$T'::date - 3, '본원', 1, '$D', '16:00', '22:00')"
ok "$(as $D "select to_char((public.work_fix(null, '$D', '$T'::date - 3, '본원', '15:40', '22:00', '출근 못 누름')->>'start_at')::timestamptz at time zone 'Asia/Seoul', 'HH24:MI')")" "16:00" "고친 기록도 근무표 시작부터 셈"
ok "$(as $C "select public.work_record_delete($RID)" | grep -c not_allowed)" "1" "조교는 기록을 못 지움"
ok "$(as $K "select public.work_record_delete($RID); select count(*) from public.work_records where id=$RID")" "0" "대표님은 지울 수 있음"
ok "$(psql -q -X -tA -d $DB -c "set role anon; select public.work_me()" 2>&1 | grep -c 'permission denied')" "1" "공개 키로는 함수 실행 불가"

echo
echo "결과: 통과 $pass · 실패 $fail"
[ $fail -eq 0 ]
