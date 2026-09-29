-- 교사별 Supabase Auth 계정을 앱의 교사 권한과 연결한다.
-- auth.users 계정은 Supabase Dashboard > Authentication > Users에서 관리한다.

create schema if not exists private;

create table if not exists public.teacher_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_id text not null unique
    check (login_id ~ '^[a-z0-9][a-z0-9._-]{1,39}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  active boolean not null default true,
  role text not null default 'teacher',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_accounts_role_check check (role in ('teacher', 'admin'))
);

alter table public.teacher_accounts enable row level security;
revoke all on table public.teacher_accounts from anon, authenticated;
grant select on table public.teacher_accounts to authenticated;

drop policy if exists "teachers read their own account" on public.teacher_accounts;
create policy "teachers read their own account"
on public.teacher_accounts
for select
to authenticated
using ((select auth.uid()) = user_id and active);

create or replace function private.is_active_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_accounts t
    where t.user_id = (select auth.uid())
      and t.active
  );
$$;

revoke all on function private.is_active_teacher() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_teacher() to authenticated;

comment on table public.teacher_accounts is
  'Supabase Auth 사용자와 슈국 교사 아이디를 연결한다. 비밀번호는 이 표에 저장하지 않는다.';
comment on function private.is_active_teacher() is
  '현재 JWT 사용자가 활성 교사 계정인지 RLS에서 확인한다.';
