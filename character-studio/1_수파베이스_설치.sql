-- ============================================================
-- 슈국 캐릭터 스튜디오 — 수파베이스 설치 (한 번만 실행)
--
-- 사용법:
--   1) 수파베이스에서 새 프로젝트를 만든다 (기존 프로젝트에 넣어도 됨).
--   2) 왼쪽 메뉴 SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   3) "Success. No rows returned"가 나오면 끝.
--
-- 만들어지는 것: 표 3개(cs_characters, cs_character_images, cs_scenes)
--               + 이미지 보관함 2개(cs-refs, cs-scenes)
-- 표·보관함 이름에 cs_ 접두를 붙여 두어, 기존 프로젝트에 넣어도
-- 다른 데이터와 섞이지 않는다.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) 캐릭터 (이름 + 설명서)
create table if not exists cs_characters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sheet      text not null default '',          -- 캐릭터 설명서(프롬프트에 그대로 들어감)
  created_at timestamptz not null default now()
);

-- 2) 캐릭터 참고 이미지 (원본·회전시트·표정시트 등)
create table if not exists cs_character_images (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references cs_characters(id) on delete cascade,
  kind         text not null default '기타',    -- 원본 / 회전시트 / 표정시트 / 기타
  path         text not null,                   -- cs-refs 보관함 안의 파일 경로
  sort         int  not null default 0,         -- 작은 숫자가 먼저 전송됨(앞 5장)
  created_at   timestamptz not null default now()
);

-- 3) 만든 장면 기록
create table if not exists cs_scenes (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid references cs_characters(id) on delete set null,
  prompt       text not null default '',        -- 사용자가 적은 장면 설명
  full_prompt  text not null default '',        -- 실제로 제미나이에 보낸 전체 문장
  image_path   text,                            -- cs-scenes 보관함 안의 파일 경로
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 접근 권한: 개인용 도구라 anon 키로 모든 동작을 허용한다.
-- (열쇠가 있는 사람은 누구나 읽고 쓸 수 있으니 HTML 파일과 열쇠를
--  다른 사람에게 보내지 말 것 — README 참고)
-- ------------------------------------------------------------
alter table cs_characters       enable row level security;
alter table cs_character_images enable row level security;
alter table cs_scenes           enable row level security;

drop policy if exists "cs_characters_all"       on cs_characters;
drop policy if exists "cs_character_images_all" on cs_character_images;
drop policy if exists "cs_scenes_all"           on cs_scenes;

create policy "cs_characters_all" on cs_characters
  for all to anon, authenticated using (true) with check (true);
create policy "cs_character_images_all" on cs_character_images
  for all to anon, authenticated using (true) with check (true);
create policy "cs_scenes_all" on cs_scenes
  for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 이미지 보관함 2개 (공개 읽기 — 페이지가 주소로 바로 띄운다)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cs-refs', 'cs-refs', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('cs-scenes', 'cs-scenes', true)
on conflict (id) do update set public = true;

drop policy if exists "cs_storage_read"   on storage.objects;
drop policy if exists "cs_storage_write"  on storage.objects;
drop policy if exists "cs_storage_update" on storage.objects;
drop policy if exists "cs_storage_delete" on storage.objects;

create policy "cs_storage_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('cs-refs', 'cs-scenes'));

create policy "cs_storage_write" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('cs-refs', 'cs-scenes'));

create policy "cs_storage_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id in ('cs-refs', 'cs-scenes'))
  with check (bucket_id in ('cs-refs', 'cs-scenes'));

create policy "cs_storage_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id in ('cs-refs', 'cs-scenes'));
