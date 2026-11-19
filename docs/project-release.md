# 프로젝트 출시 기능 적용

## DB 설정

1. Supabase SQL Editor에서 `migrations/20261119_project_release.sql` 전체를 실행합니다. 기존 projects, problems, project_problems, empathies 테이블을 사용합니다.
2. 프로젝트 담당자를 지정합니다. 아래 프로젝트 ID와 이메일을 실제 값으로 바꾼 뒤 실행합니다. 이메일은 로그인에 사용하는 Supabase Auth 계정입니다.

```sql
select id,title,owner_id from public.projects order by id;
update public.projects
set owner_id=(select id from auth.users where email='student01@example.com')
where id=1;
```

3. 프로젝트와 불편함의 연결은 기존 `project_problems(project_id, problem_id)` 데이터를 사용합니다. 담당자가 없는 프로젝트는 일반 사용자에게 수정 버튼이 표시되지 않습니다. 이 버전에서는 담당자 한 명을 설정합니다.
4. 백엔드와 프론트엔드를 각각 배포합니다. 서버의 `SUPABASE_SECRET_KEY`는 service_role 권한이 있는 서버 전용 키여야 합니다. 프론트엔드에 노출하지 않습니다.

## 사용 흐름

- 담당자로 로그인 → 프로젝트 상세 → 프로젝트 수정 → 서비스 주소/사용 방법 입력 → 서비스 운영 중으로 저장.
- 모든 사용자는 운영 중 프로젝트의 서비스 사용하기 버튼으로 배포된 사이트에 이동합니다. NEEDIT가 외부 프로젝트를 대신 배포하지는 않습니다.
- 기존 연결된 불편함 상세에는 운영 중인 서비스가 표시됩니다.
- 로그인 사용자는 프로젝트를 관심 등록하고 후기 또는 오류를 작성할 수 있습니다. 새로고침 이후에도 DB에서 복원됩니다.
- 마이페이지의 관심 프로젝트는 관심 등록한 프로젝트, 참여 프로젝트는 담당 프로젝트를 표시합니다.
- 상단 종 아이콘을 열면 관심 등록한 프로젝트 또는 공감한 불편함에 연결된 프로젝트의 출시 알림이 표시됩니다. 클릭하면 읽음 처리됩니다. 이메일/푸시 알림은 발송하지 않습니다.
- 운영 중에서 개발/테스트로 되돌리면 사용하기 버튼과 출시 알림이 숨겨집니다. 다시 운영 중으로 변경하면 새로운 출시 시각으로 알림이 표시됩니다. 운영 중에 사용 방법만 바꾸면 출시 시각은 유지됩니다.
- 출시 알림은 알림 창을 열 때 조회합니다. 현재 관심/공감 관계를 기준으로 과거 출시도 표시합니다.

## API

| 요청 | 인증 | 용도 |
|---|---|---|
| GET /api/projects | 선택 | 프로젝트 목록과 연결 불편함 ID |
| GET /api/projects/:id | 선택 | 상세, 관련 불편함, 후기 |
| PUT /api/projects/:id | 담당자 | release_status, deployment_url, usage_guide 수정 |
| PUT /api/projects/:id/favorite | 필요 | interested boolean으로 관심 등록/해제 |
| POST /api/projects/:id/feedback | 필요 | kind(review/bug), content(1~1000자) 등록 |
| GET /api/projects/notifications | 필요 | 현재 사용자의 출시 알림 |
| POST /api/projects/:id/read | 필요 | 현재 출시 알림 읽음 처리 |

별도의 네트워크 배포나 실제 Supabase SQL 실행은 로컬 코드 수정에 포함되지 않습니다. SQL 실행 전에는 프로젝트 API에서 DB 설정 오류가 발생할 수 있습니다.
