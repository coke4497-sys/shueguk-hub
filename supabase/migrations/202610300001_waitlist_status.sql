-- 대기생 상태 (2026-10-30 원장님 "대기생의 상태를 대기, 입학, 입테탈락, 블랙, 회신없음, 의사없음 으로 바꿀 수 있도록 해주세요. 삭제 기능도 필요해요")
--
-- · student_waitlist.status 의 허용 값을 넓힌다 — 예비 슈스 줄은 대기 · 입학 · 입테탈락 · 블랙 · 회신없음 · 의사없음.
--   옛 값 '완료'·'취소'도 그대로 허용(재원 슈스 반 이동 대기는 종전대로 대기 · 완료(이동 완료) · 취소, 지난 줄도 그대로 보여야 하므로).
-- · 예비 줄의 옛 '완료'(신입 등록 전환)는 뜻이 같은 '입학'으로 바꾼다. '취소'는 어느 새 상태인지 알 수 없어 그대로 둔다(화면에서 다시 고를 수 있다).
-- · 삭제는 새 권한이 필요 없다(202610290001 이 authenticated 에 delete 를 이미 주었다) — 화면(슈퍼스타 관리 [삭제])만 더했다.
-- · 상태가 바뀔 때의 done_at/done_by_name/done_note 처리는 202610290001 의 트리거 그대로(대기로 돌아가면 비움, 그 밖은 처음 바뀔 때 done_at).
alter table public.student_waitlist drop constraint if exists student_waitlist_status_check;
alter table public.student_waitlist add constraint student_waitlist_status_check
  check (status in ('대기', '입학', '입테탈락', '블랙', '회신없음', '의사없음', '완료', '취소'));
update public.student_waitlist set status = '입학' where kind = '예비' and status = '완료';
