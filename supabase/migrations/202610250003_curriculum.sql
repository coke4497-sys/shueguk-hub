-- 전체 커리큘럼 (2026-10-25 원장님 "슈국 운영에 전체 커리큘럼 메뉴" → 정리본 시트 「2026 슈국 커리큘럼 정리본」을 한 번 옮겨 오고
-- 그 뒤로는 메뉴 화면에서 고친다. 고치는 사람은 원장님(관리자)만, 보기는 교사 계정 모두. 중1은 뺀다.)
--   curriculum_weeks : 학년 × 주(수요일) — 가 수업·나 수업·확인 메모
--   curriculum_books : 학교 × 학기(고등 1-1~3-2 / 중등 1~3학년) — 과목명·출판사·특이사항, term '' = 학교 메모
--   curriculum_set / curriculum_book_set : 관리자만 쓰는 함수(표는 직접 못 쓴다)
-- 다른 마이그레이션과 순서 상관없음(teacher_accounts 만 씀). 다시 실행해도 안전하다.

create table if not exists public.curriculum_weeks (
  year integer not null,                       -- 커리큘럼 연도(2026 = 2025-12 ~ 2026-12)
  grade text not null check (grade in ('중1','중2','중3','고1','고2','고3')),
  week date not null check (extract(isodow from week) = 3),   -- 그 주 수요일
  ga text not null default '' check (length(ga) <= 1000),
  na text not null default '' check (length(na) <= 1000),
  note text not null default '' check (length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by_name text not null default '',
  primary key (year, grade, week)
);

create table if not exists public.curriculum_books (
  year integer not null,
  level text not null check (level in ('고등','중등')),
  school text not null check (length(school) between 1 and 30),
  ord integer not null default 0,
  term text not null default '' check (term in ('','1-1','1-2','2-1','2-2','3-1','3-2','1학년','2학년','3학년')),
  subject text not null default '' check (length(subject) <= 100),
  publisher text not null default '' check (length(publisher) <= 100),
  note text not null default '' check (length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by_name text not null default '',
  primary key (year, level, school, term)
);

alter table public.curriculum_weeks enable row level security;
alter table public.curriculum_books enable row level security;
revoke all on table public.curriculum_weeks, public.curriculum_books from anon, authenticated;
grant select on table public.curriculum_weeks, public.curriculum_books to authenticated;
-- 공용 교사 계정(teachers@)도 읽을 수 있게 authenticated 전체 허용(슈국 스케쥴 수업 기록 창에서 쓸 수 있도록)
drop policy if exists curriculum_weeks_read on public.curriculum_weeks;
create policy curriculum_weeks_read on public.curriculum_weeks for select to authenticated using (true);
drop policy if exists curriculum_books_read on public.curriculum_books;
create policy curriculum_books_read on public.curriculum_books for select to authenticated using (true);

-- 고치는 사람: 활성 관리자(원장님)만
create or replace function private.curriculum_editor()
returns text
language sql stable security definer set search_path = ''
as $$
  select t.display_name from public.teacher_accounts t
  where t.user_id = (select auth.uid()) and t.active and t.role = 'admin';
$$;
revoke all on function private.curriculum_editor() from public;

create or replace function public.curriculum_set(p_year integer, p_grade text, p_week date,
  p_ga text, p_na text, p_note text)
returns public.curriculum_weeks
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.curriculum_editor();
  v_row public.curriculum_weeks;
begin
  if v_name is null then
    raise exception 'not_admin';
  end if;
  if extract(isodow from p_week) <> 3 then
    raise exception 'not_wednesday';
  end if;
  insert into public.curriculum_weeks (year, grade, week, ga, na, note, updated_at, updated_by_name)
  values (p_year, p_grade, p_week, btrim(coalesce(p_ga, '')), btrim(coalesce(p_na, '')), btrim(coalesce(p_note, '')), now(), v_name)
  on conflict (year, grade, week) do update set
    ga = excluded.ga, na = excluded.na, note = excluded.note,
    updated_at = now(), updated_by_name = v_name
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.curriculum_book_set(p_year integer, p_level text, p_school text, p_term text,
  p_subject text, p_publisher text, p_note text)
returns public.curriculum_books
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.curriculum_editor();
  v_row public.curriculum_books;
  v_ord integer;
begin
  if v_name is null then
    raise exception 'not_admin';
  end if;
  select coalesce(max(b.ord), 0) into v_ord from public.curriculum_books b
   where b.year = p_year and b.level = p_level and b.school = btrim(p_school);
  if v_ord = 0 then
    select coalesce(max(b.ord), 0) + 1 into v_ord from public.curriculum_books b
     where b.year = p_year and b.level = p_level;
  end if;
  insert into public.curriculum_books (year, level, school, ord, term, subject, publisher, note, updated_at, updated_by_name)
  values (p_year, p_level, btrim(p_school), v_ord, coalesce(p_term, ''), btrim(coalesce(p_subject, '')),
          btrim(coalesce(p_publisher, '')), btrim(coalesce(p_note, '')), now(), v_name)
  on conflict (year, level, school, term) do update set
    subject = excluded.subject, publisher = excluded.publisher, note = excluded.note,
    updated_at = now(), updated_by_name = v_name
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.curriculum_set(integer, text, date, text, text, text) from public, anon;
revoke all on function public.curriculum_book_set(integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.curriculum_set(integer, text, date, text, text, text) to authenticated;
grant execute on function public.curriculum_book_set(integer, text, text, text, text, text, text) to authenticated;
