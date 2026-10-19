-- 활성 교사 계정의 표시 이름은 겹치지 않게 (2026-10-19, 슈톡 Codex 검토)
-- 슈톡은 메시지의 @이름으로 할 일을 맡기므로 같은 이름이 둘이면 누구인지 가릴 수 없다.
-- 같은 이름이면 학생 명단처럼 이름 뒤에 A·B를 붙인다('김지원A'). 공백·대소문자는 같은 것으로 본다.
-- 적용 전 확인: 활성 계정 25명 중 같은 이름 없음(2026-10-19).
create unique index if not exists teacher_accounts_active_name_uniq
  on public.teacher_accounts (lower(btrim(display_name)))
  where active;
