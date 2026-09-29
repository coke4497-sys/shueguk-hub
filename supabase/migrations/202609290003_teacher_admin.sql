-- 최초 관리자 지정 후 웹에서 교사 계정을 발급할 수 있게 역할과 생성자를 기록한다.

alter table public.teacher_accounts
  add column if not exists role text not null default 'teacher',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  alter table public.teacher_accounts
    add constraint teacher_accounts_role_check
    check (role in ('teacher', 'assistant', 'admin'));
exception
  when duplicate_object then null;
end
$$;

comment on column public.teacher_accounts.role is
  'admin은 계정 발급 관리자, teacher는 선생님, assistant는 조교';
comment on column public.teacher_accounts.created_by is
  '이 교사 계정을 발급한 관리자 Auth 사용자';

-- 첫 관리자 한 명은 아래 예시를 실제 아이디로 바꾸어 SQL Editor에서 지정한다.
-- update public.teacher_accounts set role = 'admin' where login_id = '관리자아이디';
