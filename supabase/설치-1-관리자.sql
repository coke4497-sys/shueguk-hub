-- 슈국 교사 로그인 1단계: 계정 표와 최초 관리자 생성

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

alter table public.teacher_accounts
  add column if not exists role text not null default 'teacher',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  alter table public.teacher_accounts
    add constraint teacher_accounts_role_check
    check (role in ('teacher', 'admin'));
exception
  when duplicate_object then null;
end
$$;

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

-- 아래 세 값을 실제 관리자 정보로 바꾸어 실행한다.
insert into public.teacher_accounts (user_id, login_id, display_name, role, active)
values ('AUTH-USER-UUID', '관리자아이디', '관리자이름', 'admin', true)
on conflict (user_id) do update
set login_id = excluded.login_id,
    display_name = excluded.display_name,
    role = 'admin',
    active = true,
    updated_at = now();
