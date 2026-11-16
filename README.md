# Backend — Spring Boot

기본 패키지: com.needit

- domain/problem: 불편함·공감·댓글
- domain/idea: AI 아이디어 생성
- domain/project: 프로젝트 선택·진행 상태·베타 링크
- domain/feedback: 피드백
- domain/user: 사용자
- 각 도메인의 controller: 요청 처리 / service: 비즈니스 로직 / repository: DB 접근 / entity: 데이터 모델 / dto: 요청·응답 객체
- global/config: CORS 등 공통 설정
- global/exception: 예외 처리
- global/response: 공통 응답
- src/main/resources: application.yml 등
- src/test/java/com/needit: 테스트

## 초기 설정

Spring Initializr에서 버전을 팀과 합의하여 프로젝트를 생성하고 이 폴더에 합치세요.
기본 패키지는 com.needit, 추천 시작 의존성은 Spring Web, Validation, Spring Data JPA 및 선택한 DB 드라이버입니다.
Gradle 선택 시 wrapper도 포함하세요. 설정 완료 후 Windows에서는 ./gradlew.bat bootRun으로 실행합니다.
현재는 빌드 파일, wrapper 및 Application 클래스가 없어 실행되지 않습니다.

.env.example은 변수명 참고용입니다. Spring Boot는 .env를 자동으로 읽지 않으므로 실행 환경변수 또는 별도 설정으로 연결하세요.
DB 예시는 PostgreSQL 기준입니다. AI_API_KEY도 서버 설정에서 직접 연결해야 하는 사용자 정의 변수입니다.
프론트의 localhost:5173을 허용하는 CORS 또는 프론트 개발 프록시 설정을 추가하세요.