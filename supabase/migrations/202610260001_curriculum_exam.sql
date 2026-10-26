-- 전체 커리큘럼 — 주마다 '내신 대비 종류' (2026-10-26 원장님 디자인 개선안: 학년별 화면의 시험 흐름 띠·내신 대비 묶음, 고치기 창의 '내신 대비 주' 고르기)
--   curriculum_weeks.exam : '' | '1학기 중간' | '1학기 기말' | '2학기 중간' | '2학기 기말'
--   열을 처음 만들 때 한 번만 글에서 채운다 — 가·나 수업에 '중간고사 대비/마무리'·'기말고사 대비/마무리'가 있으면
--   3~7월은 1학기, 8~12월은 2학기 (화면 curriculum.html 의 examGuess 와 같은 규칙). 다시 실행해도 고친 값을 덮지 않는다.
--   curriculum_set 은 p_exam 을 더 받는다(빼고 부르면 지금 값 그대로). 202610250003 뒤에 실행.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'curriculum_weeks' and column_name = 'exam') then
    alter table public.curriculum_weeks add column exam text not null default ''
      check (exam in ('', '1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'));
    update public.curriculum_weeks w set exam =
      (case when extract(month from w.week) between 3 and 7 then '1학기 ' else '2학기 ' end) ||
      (case when (w.ga || ' ' || w.na) ~ '중간고사\s*(대비|마무리)' then '중간' else '기말' end)
    where (w.ga || ' ' || w.na) ~ '(중간|기말)고사\s*(대비|마무리)'
      and extract(month from w.week) between 3 and 12;
  end if;
end $$;

drop function if exists public.curriculum_set(integer, text, date, text, text, text);
create or replace function public.curriculum_set(p_year integer, p_grade text, p_week date,
  p_ga text, p_na text, p_note text, p_exam text default null)
returns public.curriculum_weeks
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.curriculum_editor();
  v_row public.curriculum_weeks;
  v_exam text := btrim(coalesce(p_exam, ''));
begin
  if v_name is null then
    raise exception 'not_admin';
  end if;
  if extract(isodow from p_week) <> 3 then
    raise exception 'not_wednesday';
  end if;
  if p_exam is not null and v_exam not in ('', '1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말') then
    raise exception 'bad_exam';
  end if;
  insert into public.curriculum_weeks (year, grade, week, ga, na, note, exam, updated_at, updated_by_name)
  values (p_year, p_grade, p_week, btrim(coalesce(p_ga, '')), btrim(coalesce(p_na, '')), btrim(coalesce(p_note, '')),
          v_exam, now(), v_name)
  on conflict (year, grade, week) do update set
    ga = excluded.ga, na = excluded.na, note = excluded.note,
    exam = case when p_exam is null then public.curriculum_weeks.exam else excluded.exam end,
    updated_at = now(), updated_by_name = v_name
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.curriculum_set(integer, text, date, text, text, text, text) from public, anon;
grant execute on function public.curriculum_set(integer, text, date, text, text, text, text) to authenticated;
