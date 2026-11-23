# NEEDIT | Backend

**대학생의 실제 불편함을 AI로 구체화하고, 개발 프로젝트와 서비스 출시까지 연결하는 플랫폼**

2026 경북대학교 컴퓨터학부 해커톤 프로젝트 NEEDIT의 백엔드 저장소입니다. 로그인한 사용자를 기준으로 불편함·공감·댓글·개인 AI 기획안·프로젝트·사용자 피드백을 저장하고 제공합니다.

- 서비스: [NEEDIT](https://needit-frontend.onrender.com)
- 프론트엔드: [needit-frontend](https://github.com/j8nyun9/needit-frontend)
- 백엔드: [needit-backend](https://github.com/j8nyun9/needit-backend)
- 배포 API: `https://needit-backend-d3lv.onrender.com/api`
- 상태 확인: [GET /health](https://needit-backend-d3lv.onrender.com/health)

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| Runtime · Language | Node.js, JavaScript |
| Framework | Express 5 |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth, 서버 애플리케이션 세션 |
| AI | Google Gemini API, `@google/genai` |
| 테스트 | Node.js 내장 테스트 러너, API 요청 및 DB 모의 객체 |
| 배포 | Render Web Service |

## 주요 기능과 처리 규칙

- **인증:** Supabase Auth에서 이메일·비밀번호를 검증하고 애플리케이션 세션을 발급합니다. 세션 갱신·조회·로그아웃을 지원합니다.
- **불편함:** 등록·조회·수정·삭제, 공감·취소, 댓글 등록·조회·수정·삭제를 제공합니다. 작성자 정보는 요청 본문이 아닌 인증 세션에서 결정합니다.
- **개인 AI 기획안:** Gemini가 해결 가능성과 이유, 서비스 아이디어, 주요 기능, 기술 스택, MVP 범위 등을 분석합니다. 결과는 사용자·불편함별로 저장하고 본인에게만 제공합니다.
- **프로젝트 채택:** 본인이 생성한 AI 기획안이 필요합니다. `swCategory=difficult`인 결과는 채택을 차단하고, 개발 완료 예정일은 한국 시간 기준 오늘 또는 이후 날짜로 필수 검증합니다.
- **중복 채택:** 다른 사용자들은 같은 불편함에서 각각 프로젝트를 시작할 수 있습니다. 같은 사용자의 동일 불편함 중복 채택은 제한합니다.
- **프로젝트 관리:** 담당자만 소개·주요 기능·사용 방법·단계·예정일을 수정하고, 서비스를 공개하거나 공개 취소·삭제할 수 있습니다.
- **사용자 피드백:** 운영 중인 프로젝트에 후기·오류를 등록하고 하트 반응을 저장합니다. 본인이 작성한 의견만 수정·삭제할 수 있습니다.
- **출시 알림:** 관심 프로젝트 또는 공감한 불편함과 연결된 프로젝트가 운영 중이면 출시 목록에 표시합니다. 출시 시각별 읽음 상태를 저장합니다.
- **마이페이지:** 내 글, 공감한 글, 관심 프로젝트, 담당 프로젝트, 프로필 및 최근 활동을 계정 기준으로 조회합니다.

프로젝트 단계는 **기획 중 / 개발 중 / 테스트 중 / 서비스 운영 중**입니다. 운영 중으로 공개하려면 유효한 HTTP(S) 서비스 주소가 필요합니다. NEEDIT이 외부 서비스를 직접 호스팅하거나 자동 배포하지는 않습니다.

## 로컬 실행

Node.js와 npm이 필요합니다. 개발·검증에는 Node.js 24를 사용했습니다.

```bash
git clone https://github.com/j8nyun9/needit-backend.git
cd needit-backend
npm ci
```

`.env.example`을 복사해 `.env`를 만들고 값을 입력합니다.

```dotenv
PORT=4000
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=your-supabase-project-url
SUPABASE_SECRET_KEY=your-server-only-secret-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=your-available-gemini-model
```

- `SUPABASE_SECRET_KEY`: DB 서비스 권한과 Auth Admin 권한을 가진 서버 전용 키입니다.
- `GEMINI_MODEL`: 사용할 수 있는 Gemini 모델 ID를 지정합니다. 저장소 기본값은 `.env.example` 및 `src/services/aiPlanner.js`에서 확인합니다.
- `.env`와 실제 비밀 키는 커밋하거나 프론트엔드로 전달하지 않습니다.
- 현재 CORS 허용 주소는 `src/app.js`에서 관리합니다. **`FRONTEND_URL` 값만 바꿔도 CORS가 자동 변경되는 구조는 아닙니다.**

```bash
npm run dev
```

```text
GET http://localhost:4000/health
→ { "status": "ok" }
```

프로덕션 실행은 `npm start`를 사용합니다.

## Supabase 설정

### 기존 테이블과 계정

이 저장소의 SQL은 **기존 DB를 확장하는 마이그레이션**입니다. 빈 Supabase 프로젝트의 전체 초기 스키마를 생성하는 통합 SQL은 포함하지 않습니다. 새 DB를 사용할 경우 팀의 기존 스키마를 먼저 준비해야 합니다.

기본 테이블은 `profiles`, `problems`, `comments`, `empathies`, `projects`, `project_problems`입니다. 확장 기능은 `problem_ai_plans`, `project_favorites`, `project_feedback`, `project_notification_reads`, `project_members`, `project_feedback_reactions`를 사용합니다.

학생 계정은 **Supabase Authentication > Users**에 생성합니다. `profiles.id`는 해당 Auth 사용자의 UUID와 일치해야 합니다. 프로필 테이블에 이름·이메일·비밀번호만 저장하는 것으로는 로그인되지 않으며, 비밀번호는 Supabase Auth에서 관리합니다.

### 기능별 마이그레이션

운영 DB에 아직 적용되지 않은 SQL만 확인해 Supabase SQL Editor에서 실행합니다. 아래 순서는 현재 기능 기준의 안내이며, 중복 채택 관련 과거 파일을 무조건 날짜순으로 전부 실행하지 않습니다.

| 순서 | 파일 | 역할 |
| --- | --- | --- |
| 1 | [개인 AI 기획안](migrations/20261118_personal_ai_plans.sql) | 사용자별 결과 저장 |
| 2 | [댓글 작성자](migrations/20261119_comment_author_delete.sql) | 댓글 작성자 연결 |
| 3 | [불편함 작성자·삭제](migrations/20261119_problem_ownership_delete.sql) | 작성자 연결과 삭제 함수 |
| 4 | [불편함 삭제 복구](migrations/20261119_repair_problem_deletion.sql) | 삭제 함수·권한 호환 보완 |
| 5 | [프로젝트 출시](migrations/20261119_project_release.sql) | 담당자, 서비스 주소, 후기·관심·알림 |
| 6 | [프로젝트 일정](migrations/20261122_project_schedule.sql) | 개발 완료 예정일 |
| 7 | [프로젝트 참여·반응](migrations/20261123_project_members_reactions.sql) | 참여 정보와 후기 반응 |
| 8 | [사용자별 중복 채택 제한](migrations/20261123_single_adoption_per_user.sql) | 현재 프로젝트 채택 RPC |
| 9 | [프로젝트 삭제](migrations/20261123_project_deletion.sql) | 삭제 권한과 연결 데이터 정리 |

- `20261120_project_adoption.sql`, `20261121_project_multi_adoption.sql`은 과거 채택 정책입니다. 최종 정책은 `20261123_single_adoption_per_user.sql`을 기준으로 적용합니다.
- [기존 서비스 소개 보정](migrations/20261123_backfill_project_service_introductions.sql)은 선택 사항입니다. 비어 있거나 불편함 원문으로 저장된 소개를 담당자의 AI 서비스 소개로 보정하며, 별도로 수정한 소개는 유지합니다.
- 과거에 작성자 없이 생성된 글·댓글이나 담당자 없는 프로젝트는 이름만으로 소유권을 추정하지 않습니다. 실제 작성자를 확인한 뒤 연결해야 합니다.
- 불편함 삭제는 공감·댓글·개인 기획안·프로젝트 연결을 정리하고 **프로젝트 자체는 유지**합니다. 프로젝트 삭제는 관련 데이터와 연결을 정리하고 **원본 불편함과 개인 기획안은 유지**합니다.

마이페이지의 저장·복원 방식은 [마이페이지 문서](docs/mypage-persistence.md), 불편함 삭제 설정은 [삭제 문서](docs/problem-deletion.md)를 참고합니다.

## 주요 API

아래 경로는 `/api` 기준입니다. 인증이 필요한 요청에는 `Authorization: Bearer <accessToken>`을 전달합니다.

| 메서드 | 경로 | 기능 · 권한 |
| --- | --- | --- |
| POST | `/auth/login` | 이메일·비밀번호 로그인 |
| POST | `/auth/refresh` | refreshToken으로 세션 갱신 |
| GET | `/auth/me` | 로그인 사용자 조회 |
| POST | `/auth/logout` | 세션 종료 |
| GET / POST | `/problems` | 공개 목록 / 로그인 사용자 등록 |
| GET | `/problems/:id` | 상세와 본인 AI 기획안 |
| PATCH / DELETE | `/problems/:id` | 작성자만 수정 / 삭제 |
| PUT / DELETE | `/problems/:id/likes/me` | 공감 / 취소 |
| GET / POST | `/problems/:id/comments` | 댓글 조회 / 등록 |
| PATCH / DELETE | `/problems/:id/comments/:commentId` | 댓글 작성자만 수정 / 삭제 |
| POST | `/problems/:id/plan` | 본인 AI 기획안 생성·재생성 |
| GET / POST | `/projects` | 공개 목록 / 프로젝트 등록 |
| GET | `/projects/:id` | 상세·관련 불편함·피드백 |
| PATCH | `/projects/:id` | 담당자의 소개·기능·일정·상태 등 수정 |
| PUT | `/projects/:id` | 담당자의 공개 상태·주소·사용 방법 저장 |
| DELETE | `/projects/:id` | 담당자만 프로젝트 삭제 |
| POST | `/projects/:id/unpublish` | 공개 취소, 테스트 중으로 변경 |
| PUT | `/projects/:id/favorite` | 관심 등록·해제 |
| GET / POST | `/projects/:id/feedback` | 의견 조회 / 운영 중 프로젝트에 의견 등록 |
| PATCH / DELETE | `/projects/:id/feedback/:feedbackId` | 의견 작성자만 수정 / 삭제 |
| PUT | `/projects/:id/feedback/:feedbackId/reaction` | 반응 저장·취소; 현재 UI는 하트 사용 |
| GET | `/projects/notifications` | 현재 사용자 출시 알림 |
| POST | `/projects/:id/read` | 출시 알림 읽음 처리 |
| GET | `/account` | 마이페이지 통합 조회 |
| PUT | `/account/profile` | 본인 프로필 수정 |

불편함 채택은 `POST /projects`에 `problem_id`, `title`, `description`, `features`, `expected_completion_date` 등을 전달합니다. 담당자는 서버가 결정하며 본인 AI 기획안, 해결 가능성, 필수 일정과 중복 채택을 검증합니다.

## 인증 및 데이터 접근

- 공개 조회는 비로그인 사용자도 이용할 수 있으며, 쓰기는 인증을 요구합니다.
- 서버는 Supabase 로그인 결과로 별도의 무작위 애플리케이션 토큰을 발급합니다. 프론트엔드에 서버용 Supabase 키를 전달하지 않습니다.
- 애플리케이션 세션은 서버 메모리에 저장됩니다. 만료·서버 재시작 후에는 프론트엔드가 refreshToken으로 갱신을 시도하며, 갱신 실패 시 다시 로그인해야 합니다.
- 여러 서버 인스턴스로 확장하려면 공통 세션 저장소가 필요합니다.
- 개인 AI 기획안은 `user_id`와 `problem_id`로 구분합니다. 다른 사용자의 기획안이나 소유자를 알 수 없는 예전 공용 결과를 노출하지 않습니다.
- 삭제·수정은 화면 버튼 노출뿐 아니라 백엔드에서도 작성자·담당자를 검사합니다.

## 테스트

PowerShell:

```powershell
$testFiles = Get-ChildItem test -Filter '*.test.js' | ForEach-Object FullName
node --test @testFiles
```

macOS / Linux:

```bash
node --test test/*.test.js
```

현재 테스트 22개가 통과했습니다. 인증·세션 갱신, 작성자 권한, 마이페이지 복원, 공감, 개인 AI 결과 접근, 댓글 수정, 프로젝트 채택·필수 날짜·중복 제한, 서비스 공개·피드백·삭제 등을 검사합니다.

테스트는 모의 DB·인증 객체를 사용하는 로컬 검증입니다. 실제 Supabase 스키마·Gemini 응답·배포 사이트에서의 전체 사용자 흐름을 대신하지 않습니다. 테스트 중 출력되는 일부 DB 오류는 실패 경로를 검증하기 위해 의도적으로 발생시킨 것입니다.

## 배포

- Render 서비스 유형: Web Service
- Build Command: `npm ci`
- Start Command: `npm start`
- 환경변수: `.env.example` 기준으로 Render에 설정
- 서버는 Render의 `PORT`를 사용해 `0.0.0.0`에서 수신합니다.
- 프론트엔드 주소가 바뀌면 `src/app.js`의 CORS 허용 목록을 함께 수정합니다.

배포 후 `/health`, 로그인, 불편함 등록, AI 생성, 프로젝트 채택, 서비스 공개, 후기·하트, 본인 데이터 수정·삭제를 확인합니다. GitHub 푸시, Render 배포 완료, Supabase SQL 적용은 각각 별도의 작업입니다.

## 폴더 구조

```text
src/
├── app.js             # 서버, CORS, 인증 적용, 라우터 연결
├── config/            # Supabase 클라이언트
├── routes/            # 불편함·인증·프로젝트 등 API 진입점
└── services/          # AI, 프로젝트, 권한, 공감, 계정 로직
test/                  # 인증·권한·저장 등 자동 테스트
migrations/            # Supabase 기능 확장 SQL
docs/                  # 기능별 설정 및 데이터 저장 설명
```

## 현재 범위

- ‘참여 프로젝트’는 담당 프로젝트이며, 일반적인 팀원 초대·승인 흐름은 제공하지 않습니다.
- 출시 알림은 조회형이며, 이메일·브라우저 푸시는 제공하지 않습니다.
- 일부 공개 목록은 최근 100개를 조회합니다. 마이페이지는 계정별로 별도 조회합니다.
- AI 결과는 개발 아이디어를 돕는 제안이며, 실제 구현 가능성과 외부 데이터 사용 조건은 개발자가 확인해야 합니다.

## 팀

- 프론트엔드: 변준영, 채시현, 성상훈
- 백엔드: 손영민, 남호찬
- 기획: 팀 전원
