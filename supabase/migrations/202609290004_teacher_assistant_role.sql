-- 교직원 계정을 선생님과 조교로 구분한다. 접근 권한은 우선 동일하게 유지한다.

alter table public.teacher_accounts
  drop constraint if exists teacher_accounts_role_check;

alter table public.teacher_accounts
  add constraint teacher_accounts_role_check
  check (role in ('teacher', 'assistant', 'admin'));

comment on column public.teacher_accounts.role is
  'admin은 계정 발급 관리자, teacher는 선생님, assistant는 조교';
