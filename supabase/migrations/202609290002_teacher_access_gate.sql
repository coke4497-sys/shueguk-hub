-- 001을 적용하고 teacher_accounts에 최소 1명의 활성 교사를 등록한 뒤 적용한다.
-- 기존 허용 정책과 함께 동작하는 restrictive 정책으로, 등록 교사가 아닌 authenticated
-- 사용자는 아래 교사용 표를 직접 읽거나 쓰지 못하게 한다.

do $$
declare
  table_name text;
  teacher_tables text[] := array[
    'omr_exams', 'omr_responses', 'report_config',
    'question_queue', 'clinic_requests', 'students', 'tt_classes',
    'review_files', 'review_targets', 'review_videos', 'review_watch',
    'tt_log', 'tt_period'
  ];
begin
  foreach table_name in array teacher_tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon', table_name);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
      execute format('drop policy if exists teacher_accounts_allow on public.%I', table_name);
      execute format('drop policy if exists teacher_accounts_gate on public.%I', table_name);
      execute format(
        'create policy teacher_accounts_allow on public.%I as permissive for all to authenticated using ((select private.is_active_teacher())) with check ((select private.is_active_teacher()))',
        table_name
      );
      execute format(
        'create policy teacher_accounts_gate on public.%I as restrictive for all to authenticated using ((select private.is_active_teacher())) with check ((select private.is_active_teacher()))',
        table_name
      );
    end if;
  end loop;
end
$$;

-- 복습 영상 교사용 비공개 자료 버킷. 학생 다운로드는 기존 서명 URL/RPC 정책과
-- 별개이며, 여기서는 활성 교사의 관리 요청만 허용한다.
drop policy if exists "active teachers manage review files" on storage.objects;
drop policy if exists "active teachers allow review files" on storage.objects;
drop policy if exists "active teachers gate review files" on storage.objects;
create policy "active teachers allow review files"
on storage.objects
as permissive
for all
to authenticated
using (bucket_id = 'review-files' and (select private.is_active_teacher()))
with check (bucket_id = 'review-files' and (select private.is_active_teacher()));

create policy "active teachers gate review files"
on storage.objects
as restrictive
for all
to authenticated
using (bucket_id <> 'review-files' or (select private.is_active_teacher()))
with check (bucket_id <> 'review-files' or (select private.is_active_teacher()));

-- SECURITY DEFINER 학생용 함수는 표의 anon 권한을 사용하지 않으므로 별도로 EXECUTE 권한을
-- 관리한다. student_bundle, omr_exam_list, omr_submit 등 실제 함수의 EXECUTE 권한은 기존
-- 마이그레이션에서 필요한 함수만 anon에 허용해야 한다.
