-- 1. Supabase Authentication에서 관리자 사용자를 먼저 만든다.
-- 2. 아래 세 값을 실제 관리자의 UUID, 아이디, 표시 이름으로 바꾼다.
-- 3. 202609290001_teacher_accounts.sql 적용 후 아래 SQL을 실행한다.
-- 4. 그 다음 202609290002, 202609290003 마이그레이션을 순서대로 적용한다.

insert into public.teacher_accounts (user_id, login_id, display_name, role)
values ('AUTH-USER-UUID', '관리자아이디', '관리자이름', 'admin')
on conflict (user_id) do update
set login_id = excluded.login_id,
    display_name = excluded.display_name,
    role = 'admin',
    active = true,
    updated_at = now();
