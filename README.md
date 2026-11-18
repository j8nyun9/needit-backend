# Backend — Node.js + Express

NEEDIT의 백엔드 서버입니다.

## 기술 스택

- Runtime: Node.js
- Framework: Express
- Language: JavaScript
- Database: PostgreSQL (Supabase 연동 예정)
- AI: LLM API (SW 해결 가능성 분석)
- Deployment: Render

## 폴더 구조

```text
needit-backend/
├── src/
│   ├── app.js
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   └── config/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

- `src/app.js`: Express 서버 실행 및 공통 설정
- `routes`: API 주소 정의
- `controllers`: HTTP 요청 및 응답 처리
- `services`: 핵심 비즈니스 로직, AI 연동
- `middleware`: 로그인 인증 및 오류 처리
- `config`: DB 연결 및 환경 설정

※ 폴더는 개발 진행에 따라 추가합니다.

## 초기 설정

Node.js 설치 후 프로젝트 폴더에서 다음 명령어를 실행합니다.

```bash
npm install
npm run dev
```

서버 기본 주소:

`http://localhost:4000`

서버 정상 작동 확인:

`GET http://localhost:4000/health`

정상 응답:

```json
{
  "status": "ok"
}
```

## 주요 구현 예정 기능

1. 불편함 등록 및 조회
2. 공감 기능
3. AI 기반 SW 해결 가능성 분류
4. 개발 프로젝트 등록 및 진행 상태 관리
5. 베타테스트 링크와 사용자 피드백

## 환경변수

`.env.example`을 참고하여 로컬 `.env` 파일을 생성합니다.

- `PORT`: 서버 포트
- `FRONTEND_URL`: React 프론트엔드 주소
- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_PUBLISHABLE_KEY`: Supabase 공개용 키
- `OPENAI_API_KEY`: AI API 키

비밀 키가 포함된 `.env` 파일은 GitHub에 업로드하지 않습니다.

## 프론트엔드 연동

프론트엔드는 React + Vite를 사용합니다.

개발 환경의 프론트엔드 기본 주소는 `http://localhost:5173`이며, 백엔드에서는 CORS 설정을 통해 해당 주소를 허용합니다.

프론트엔드는 HTTP API를 통해 백엔드와 JSON 데이터를 주고받습니다.

## 배포

Render Web Service를 통해 배포합니다.

- Language: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Region: Singapore

실제 배포 주소는 Render에서 생성된 URL을 사용합니다.
## Email login

POST /api/auth/login accepts email and password and validates them with
Supabase Auth signInWithPassword. Accounts must exist in Authentication > Users.
Profiles are read from profiles(id, name, email), with id matching the Auth user
UUID. If a profile is missing, user_metadata.name is used as a fallback.
No students table or password column is needed, and login never rewrites passwords.
A fresh Supabase client per login prevents user sessions from changing the shared
administrative client. The API returns a separate opaque application token, not
Supabase admin keys or passwords. GET /api/auth/me and POST /api/auth/logout use
Authorization: Bearer <accessToken>.
Application sessions are stored in memory for up to 8 hours, capped by the Supabase
access token expiry. Restarts invalidate them. Browser tokens use sessionStorage.
Logout revokes the application token; Supabase tokens are never given to the browser.
For multiple server instances, replace memory storage with a shared session store.