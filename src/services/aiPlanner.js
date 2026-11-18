require("dotenv").config({ quiet: true });

const { GoogleGenAI } = require("@google/genai");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const TIMEOUT_MS = 60_000;

const SW_CATEGORIES = ["direct", "partial", "difficult"];
const DIFFICULTIES = ["쉬움", "보통", "어려움"];

let ai = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new AiPlanError("CONFIG", "GEMINI_API_KEY가 설정되지 않았습니다.");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

class AiPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Gemini Structured Output 스키마 (JSON Schema)
const responseJsonSchema = {
  type: "object",
  properties: {
    swCategory: {
      type: "string",
      enum: SW_CATEGORIES,
      description: "direct: SW로 직접 해결 가능 / partial: SW로 부분적으로 해결 가능 / difficult: SW만으로 해결하기 어려움"
    },
    swReason: {
      type: "string",
      description: "분류 이유 (한국어 1~2문장)"
    },
    alternativeApproach: {
      type: "string",
      description: "partial 또는 difficult일 때 SW로 우회·보조할 수 있는 방법 (1~2문장). direct이면 빈 문자열"
    },
    hackathonPlan: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "짧은 프로젝트 이름" },
        solution: { type: "string", description: "한 줄 해결 아이디어" },
        features: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
          description: "핵심 기능 최대 3개 (각각 짧은 구문)"
        },
        techStack: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 5,
          description: "추천 기술 스택 (꼭 필요한 것만, 최대 5개)"
        },
        difficulty: { type: "string", enum: DIFFICULTIES },
        mvpScope: {
          type: "string",
          description: "1주일 내 구현 가능한 MVP 범위 (1~2문장). 1주일 안에 어렵다면 그 한계도 명시"
        }
      },
      required: ["projectName", "solution", "features", "techStack", "difficulty", "mvpScope"]
    }
  },
  required: ["swCategory", "swReason", "alternativeApproach", "hackathonPlan"]
};

const SYSTEM_INSTRUCTION = `너는 대학생 개발자를 돕는 해커톤 멘토다.
대학생이 등록한 불편함을 읽고 (1) 소프트웨어로 해결 가능한지 분류하고 (2) 개발자가 참고할 짧은 해커톤용 기획안을 제안한다.
기획안은 정답이 아니라 참고용 출발점이다.

규칙:
- swCategory: direct(SW로 직접 해결 가능), partial(SW로 부분적으로 해결 가능), difficult(SW만으로 해결하기 어려움) 중 하나.
- swReason은 한국어 1~2문장.
- partial 또는 difficult이면 alternativeApproach에 SW로 우회하거나 보조할 수 있는 방법을 간략히 쓴다. direct이면 빈 문자열.
- difficult라도 hackathonPlan은 SW로 도울 수 있는 부분에 집중해 작성한다.
- 핵심 기능은 최대 3개, 기술 스택은 꼭 필요한 것만 최대 5개.
- 대학생 2~4명이 1주일 안에 만들 수 있는 MVP 범위로 축소해 제안하고, 그래도 어렵다면 mvpScope에 한계를 명시한다.
- 시장 분석, 수익 모델, 사업계획서 수준의 설명은 쓰지 않는다.
- 모든 내용은 한국어로 짧고 간결하게 쓴다 (기술 스택 이름은 원어 그대로).`;

function nonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function stringArray(v, min, max) {
  return (
    Array.isArray(v) &&
    v.length >= min &&
    v.length <= max &&
    v.every(nonEmptyString)
  );
}

// 모델 응답을 서버에서 다시 검증하고 정해진 필드만 남긴다
function validatePlan(raw) {
  const errors = [];
  const p = raw && typeof raw === "object" ? raw : {};
  const h = p.hackathonPlan && typeof p.hackathonPlan === "object" ? p.hackathonPlan : {};

  if (!SW_CATEGORIES.includes(p.swCategory)) errors.push("swCategory");
  if (!nonEmptyString(p.swReason)) errors.push("swReason");
  if (typeof p.alternativeApproach !== "string") errors.push("alternativeApproach");
  if (!nonEmptyString(h.projectName)) errors.push("hackathonPlan.projectName");
  if (!nonEmptyString(h.solution)) errors.push("hackathonPlan.solution");
  if (!stringArray(h.features, 1, 3)) errors.push("hackathonPlan.features");
  if (!stringArray(h.techStack, 1, 5)) errors.push("hackathonPlan.techStack");
  if (!DIFFICULTIES.includes(h.difficulty)) errors.push("hackathonPlan.difficulty");
  if (!nonEmptyString(h.mvpScope)) errors.push("hackathonPlan.mvpScope");

  if (errors.length) {
    throw new AiPlanError("INVALID_RESPONSE", `응답 스키마 불일치: ${errors.join(", ")}`);
  }

  return {
    swCategory: p.swCategory,
    swReason: p.swReason.trim(),
    alternativeApproach: p.alternativeApproach.trim(),
    hackathonPlan: {
      projectName: h.projectName.trim(),
      solution: h.solution.trim(),
      features: h.features.map((s) => s.trim()),
      techStack: h.techStack.map((s) => s.trim()),
      difficulty: h.difficulty,
      mvpScope: h.mvpScope.trim()
    }
  };
}

// 로그/응답에 API 키가 섞이지 않도록 마스킹
function sanitize(message) {
  let msg = String(message || "알 수 없는 오류");
  const key = process.env.GEMINI_API_KEY;
  if (key) msg = msg.split(key).join("***");
  return msg.slice(0, 500);
}

function toAiPlanError(err) {
  if (err instanceof AiPlanError) return err;
  if (err && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return new AiPlanError("TIMEOUT", `Gemini 응답 시간 초과 (${TIMEOUT_MS / 1000}초)`);
  }
  if (err && typeof err.status === "number") {
    const code = err.status === 429 ? "RATE_LIMITED" : `GEMINI_HTTP_${err.status}`;
    return new AiPlanError(code, sanitize(err.message));
  }
  return new AiPlanError("UNKNOWN", sanitize(err && err.message));
}

// 일시적인 오류(혼잡·사용량 초과·응답 형식 오류)는 잠깐 쉬었다가 자동 재시도
const RETRYABLE = new Set(["RATE_LIMITED", "GEMINI_HTTP_500", "GEMINI_HTTP_503", "INVALID_RESPONSE", "EMPTY_RESPONSE"]);
const RETRY_DELAYS_MS = [1000, 2000]; // 최대 2번 재시도

async function generatePlan(problem) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generatePlanOnce(problem);
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= RETRY_DELAYS_MS.length) throw err;
      console.warn(`[AI] ${err.code} → ${RETRY_DELAYS_MS[attempt] / 1000}초 후 재시도 (${attempt + 1}/${RETRY_DELAYS_MS.length})`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function generatePlanOnce({ title, content, category }) {
  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: `[카테고리] ${category}\n[제목] ${title}\n[내용]\n${content}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema,
        thinkingConfig: { thinkingLevel: "low" },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS)
      }
    });

    const text = response.text;
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason || "EMPTY";
      throw new AiPlanError("EMPTY_RESPONSE", `빈 응답 (finishReason: ${reason})`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiPlanError("INVALID_RESPONSE", "JSON 파싱 실패");
    }

    return validatePlan(parsed);
  } catch (err) {
    throw toAiPlanError(err);
  }
}

module.exports = { generatePlan, validatePlan, AiPlanError, MODEL };
