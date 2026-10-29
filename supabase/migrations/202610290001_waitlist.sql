-- 대기생 명단 (2026-10-29 원장님 "슈퍼스타 관리에 대기생 리스트" → 두 가지: 예비 슈스 대기 명단 · 재원 슈스 반 이동 대기 명단)
--
-- · student_waitlist — 대기 한 사람이 한 줄. kind '예비'(아직 등록 전 학생) / '재원'(지금 다니는 학생의 반 이동 대기).
--   연도·학년·학교·이름·학부모님 연락처·희망 반(반을 골라 넣거나 미정)·메모·적은 사람(author_name)·대기 시작일(started_on, 순서 기준).
--   재원생은 student_id 로 students 줄을 잇는다(학생이 지워지면 비움).
-- · 이동 가능 판정(화면): 희망 반의 지금 인원(tt_classes 명단 수)이 cap(정원 — 등록할 때의 그 반 인원으로 자동, 고칠 수 있음)보다
--   작아지면 그 줄 색이 바뀐다. 표에는 저장만 하고 판정은 화면이 한다(명단이 수파베이스 tt_classes 에 있어서).
-- · 쓰는 곳: 슈퍼스타 관리(superstar.html — 공용 교사 계정) · 슈톡 [대기생 등록](messenger.html — 허브 개인 로그인).
--   둘 다 authenticated 이므로 정책은 authenticated 전체 허용(리포트 CLAUDE.md 045 규칙 — private.is_active_teacher()를 쓰면 공용 계정이 막힌다).
--   작성자 이름은 화면이 보낸다(공용 계정은 서버가 사람을 모른다). 공개 키(anon)는 아무것도 못 한다. 시트 사본 없음.
create table if not exists public.student_waitlist (
  id bigserial primary key,
  kind text not null check (kind in ('예비', '재원')),
  name text not null check (length(btrim(name)) > 0),
  year int,
  grade text not null default '',
  school text not null default '',
  phone_parent text not null default '',
  student_id bigint references public.students(id) on delete set null,
  want_book text not null default '' check (want_book in ('', '정규', '내신')),
  want_class_id text not null default '',
  want_class_name text not null default '',
  cap int,
  memo text not null default '',
  started_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default '대기' check (status in ('대기', '완료', '취소')),
  done_at timestamptz,
  done_by_name text not null default '',
  done_note text not null default '',
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_name text not null default ''
);
create index if not exists student_waitlist_order_idx on public.student_waitlist (kind, status, started_on, id);

create or replace function public.student_waitlist_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status <> old.status then
    if new.status = '대기' then new.done_at := null; new.done_by_name := ''; new.done_note := '';
    elsif new.done_at is null then new.done_at := now(); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists student_waitlist_touch on public.student_waitlist;
create trigger student_waitlist_touch before update on public.student_waitlist
  for each row execute function public.student_waitlist_touch();

alter table public.student_waitlist enable row level security;
drop policy if exists student_waitlist_teacher on public.student_waitlist;
create policy student_waitlist_teacher on public.student_waitlist for all to authenticated using (true) with check (true);
revoke all on public.student_waitlist from public, anon, authenticated;   -- 수파베이스 기본 권한(references·trigger·truncate 까지)을 먼저 거둔다
grant select, insert, update, delete on public.student_waitlist to authenticated;
grant usage, select on sequence public.student_waitlist_id_seq to authenticated;
grant all on public.student_waitlist to service_role;
grant usage, select on sequence public.student_waitlist_id_seq to service_role;
