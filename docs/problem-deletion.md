# 불편함 작성자 및 삭제 기능 적용

1. 백엔드가 사용하는 Supabase의 SQL Editor에서 `migrations/20261119_problem_ownership_delete.sql` 전체를 실행합니다.
2. 백엔드와 프론트엔드를 모두 배포합니다.
3. 로그인한 상태로 새 불편함을 등록합니다. 작성자 ID는 서버가 로그인 세션에서 가져옵니다. 본문에 임의 작성자 ID를 보내도 반영하지 않습니다.
4. 마이페이지의 '내가 등록한 불편함' 또는 탐색 목록에서 글을 열면, 작성자에게만 '불편함 삭제' 버튼이 표시됩니다. 확인 창에서 최종 삭제할 수 있습니다.

삭제는 DB 함수 한 번으로 처리합니다. 작성자 확인 후 댓글, 공감, AI 기획안 및 프로젝트와의 연결을 삭제하고 불편함을 삭제합니다. 연결된 프로젝트 자체는 삭제하지 않습니다. 처리 중 오류가 발생하면 전체 DB 트랜잭션이 롤백됩니다.

기존 글은 작성자 정보가 없으므로 자동으로 현재 사용자에게 배정하지 않습니다. 작성자를 확인한 글만 관리자가 SQL로 지정해야 합니다. 아래 이메일과 글 ID를 실제 값으로 바꾸세요.

```sql
update public.problems
set author_id=(select id from auth.users where email='student01@example.com')
where id=123 and author_id is null;
```

기존 테이블 `problems`, `project_problems`, `comments`, `empathies`를 사용합니다. `problem_ai_plans`가 설치된 환경에서는 해당 글의 개인 기획안도 삭제합니다. DB 함수 실행은 서버용 service_role 권한에만 허용됩니다. 삭제 후 되돌리기 기능은 제공하지 않습니다.
