const express = require("express");
const supabase = require("../config/supabase");
const { generatePlan } = require("../services/aiPlanner");

const router = express.Router();

// AI 재생성 제한 (서버 메모리 기준 — 서버 재시작 시 초기화)
const REGEN_COOLDOWN_MS = 0; // 같은 글 재생성 대기 없음 (분석 중 중복 요청은 409로 막음)
const IP_LIMIT = 30; // IP당
const IP_WINDOW_MS = 10 * 60 * 1000; // 10분에 30번 (비용 폭주 방지용)
const inFlight = new Set(); // 분석 진행 중인 글 id
const lastRegenAt = new Map(); // 글 id -> 마지막 재생성 시각
const ipHits = new Map(); // ip -> 요청 시각 배열

const AI_ERROR_MESSAGES = {
  CONFIG: "AI 설정이 완료되지 않아 분석하지 못했어요.",
  TIMEOUT: "AI 응답이 지연되어 분석하지 못했어요. 잠시 후 다시 시도해주세요.",
  RATE_LIMITED: "AI 사용량이 많아 분석하지 못했어요. 잠시 후 다시 시도해주세요.",
  GEMINI_HTTP_503: "AI 서버가 혼잡해 분석하지 못했어요. 잠시 후 다시 시도해주세요.",
  INVALID_RESPONSE: "AI 응답 형식이 올바르지 않아 분석하지 못했어요. 다시 시도해주세요.",
  EMPTY_RESPONSE: "AI가 결과를 생성하지 못했어요. 다시 시도해주세요.",
  DB_SAVE_FAILED: "AI 분석 결과를 저장하지 못했어요."
};

const CATEGORIES = ["시설\u00B7이동", "수업\u00B7학습", "학사\u00B7행정", "편의\u00B7복지", "기타"];
const LEGACY_CATEGORIES = { "시설": "시설·이동", "도서관": "수업·학습", "학교생활": "기타" };
function normalizeCategory(value) {
  if (typeof value !== "string") return null;
  // 가운데 점 종류(ㆍ ・ ‧ ∙ • ･)를 전부 같은 점(·)으로 통일
  const v = value.trim().replace(/[\u318D\u30FB\u2027\u2219\u2022\uFF65\u00B7]/g, "\u00B7");
  return LEGACY_CATEGORIES[v] ?? v;
}

const TITLE_MAX = 100;
const CONTENT_MAX = 1000;
const COMMENT_MAX = 500;

// ---------- 공통 함수 ----------

// 요청 헤더 X-Voter-Id에서 익명 사용자 ID 꺼내기 (로그인 전 임시 방식)
function getVoterId(req) {
  const value = req.get("X-Voter-Id");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 100 ? trimmed : null;
}

function isValidId(id) {
  return /^\d+$/.test(id);
}

// 내가 공감한 글 id 목록
async function getLikedIds(voterId, problemIds) {
  if (!voterId || problemIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("empathies")
    .select("problem_id")
    .eq("voter_id", voterId)
    .in("problem_id", problemIds);
  if (error) throw error;
  return new Set(data.map((row) => row.problem_id));
}

// 글 1개의 공감 수 (글이 없으면 null)
async function getLikesCount(problemId) {
  const { data, error } = await supabase
    .from("problems")
    .select("likes_count")
    .eq("id", problemId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.likes_count ?? 0 : null;
}

// 명세의 ProblemListItem 형태로 맞추기
function toListItem(row, likedIds) {
  return {
    ...row,
    likes_count: row.likes_count ?? 0,
    liked_by_me: likedIds.has(row.id),
    difficulty_scores: row.difficulty_scores ?? null
  };
}

function serverError(res, error) {
  console.error("[ERROR]", error);
  return res.status(500).json({ error: error.message || "서버 오류가 발생했습니다." });
}

// ---------- 불편함 ----------

// 1. 목록 조회 (GET /api/problems)
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("problems")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const likedIds = await getLikedIds(getVoterId(req), data.map((p) => p.id));
    res.json(data.map((row) => toListItem(row, likedIds)));
  } catch (error) {
    serverError(res, error);
  }
});

// 2. 등록 (POST /api/problems)
router.post("/", async (req, res) => {
    const { title, content } = req.body ?? {};
    const category = normalizeCategory(req.body?.category);


  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof category !== "string" ||
    !title.trim() ||
    !content.trim() ||
    title.trim().length > TITLE_MAX ||
    content.trim().length > CONTENT_MAX ||
    !CATEGORIES.includes(category.trim())
  ) {
    return res.status(400).json({
      error: `입력값을 확인해주세요. (제목 ${TITLE_MAX}자, 내용 ${CONTENT_MAX}자 이내, 카테고리: ${CATEGORIES.join(", ")})`
    });
  }

  const { data, error } = await supabase
    .from("problems")
    .insert({ title: title.trim(), content: content.trim(), category: category.trim() })
    .select()
    .single();

  if (error) return serverError(res, error);

  // AI 분석 — 실패해도 게시글 등록은 성공(201)으로 응답
  inFlight.add(data.id);
  try {
    const result = await analyzeAndSave(data);
    res.status(201).json(result.ok
      ? { ...result.row, ai_status: "success" }
      : { ...data, ai_status: "failed", ai_error: result.aiError });
  } finally {
    inFlight.delete(data.id);
  }
});

// 3. 상세 조회 (GET /api/problems/:id)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "잘못된 ID입니다." });
  }

  try {
    const { data, error } = await supabase
      .from("problems")
      .select("*, project_problems ( project_id )")
      .eq("id", Number(id))
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
    }

    const { project_problems, ...problem } = data;
    const likedIds = await getLikedIds(getVoterId(req), [problem.id]);

    res.json({
      ...toListItem(problem, likedIds),
      project_id: project_problems?.[0]?.project_id ?? null
    });
  } catch (error) {
    serverError(res, error);
  }
});

// ---------- AI 분석 ----------

// AI 분석 재생성 (POST /api/problems/:id/plan)
router.post("/:id/plan", async (req, res) => {
  const { id: rawId } = req.params;
  if (!isValidId(rawId)) return res.status(400).json({ error: "잘못된 ID입니다." });
  const id = Number(rawId);

  if (inFlight.has(id)) {
    return res.status(409).json({
      error: "이미 AI 분석이 진행 중이에요. 잠시 후 확인해주세요.",
      ai_status: "in_progress"
    });
  }

  const now = Date.now();
  const last = lastRegenAt.get(id);
  if (last && now - last < REGEN_COOLDOWN_MS) {
    const retryAfter = Math.ceil((REGEN_COOLDOWN_MS - (now - last)) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: `AI 재분석은 ${retryAfter}초 후에 다시 요청할 수 있어요.`,
      ai_status: "rate_limited",
      retry_after: retryAfter
    });
  }

  const ip = req.ip;
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_LIMIT) {
    const retryAfter = Math.ceil((IP_WINDOW_MS - (now - hits[0])) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "AI 재분석 요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
      ai_status: "rate_limited",
      retry_after: retryAfter
    });
  }

  const { data: problem, error } = await supabase
    .from("problems")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return serverError(res, error);
  if (!problem) {
    return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
  }

  hits.push(now);
  ipHits.set(ip, hits);
  lastRegenAt.set(id, now);
  inFlight.add(id);

  try {
    const result = await analyzeAndSave(problem);
    if (!result.ok) {
      // 기존 분석 결과는 그대로 유지
      return res.status(502).json({
        error: result.aiError.message,
        ai_status: "failed",
        ai_error: result.aiError
      });
    }
    res.json({ ...result.row, ai_status: "success" });
  } finally {
    inFlight.delete(id);
  }
});

// Gemini 분석 후 sw_category, sw_reason, ai_plan 저장
async function analyzeAndSave(problem) {
  let plan;
  try {
    plan = await generatePlan(problem);
  } catch (err) {
    console.error(`[AI] problem ${problem.id} 분석 실패 (${err.code || "UNKNOWN"}): ${err.message}`);
    return { ok: false, aiError: toClientError(err.code) };
  }

  const { data, error } = await supabase
    .from("problems")
    .update({
      sw_category: plan.swCategory,
      sw_reason: plan.swReason,
      ai_plan: plan
    })
    .eq("id", problem.id)
    .select()
    .single();

  if (error) {
    console.error(`[AI] problem ${problem.id} 분석 결과 저장 실패: ${error.message}`);
    return { ok: false, aiError: toClientError("DB_SAVE_FAILED") };
  }

  return { ok: true, row: data };
}

function toClientError(code) {
  const c = code || "UNKNOWN";
  return {
    code: c,
    message: AI_ERROR_MESSAGES[c] || "AI 분석에 실패했어요. 잠시 후 다시 시도해주세요."
  };
}

// ---------- 공감 ----------

// 4. 공감하기 (PUT /api/problems/:id/likes/me) - 여러 번 눌러도 1번만 반영
router.put("/:id/likes/me", async (req, res) => {
  const { id } = req.params;
  const voterId = getVoterId(req);
  if (!isValidId(id)) return res.status(400).json({ error: "잘못된 ID입니다." });
  if (!voterId) return res.status(400).json({ error: "X-Voter-Id 헤더가 필요합니다." });

  try {
    if ((await getLikesCount(Number(id))) === null) {
      return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
    }

    const { error } = await supabase
      .from("empathies")
      .upsert(
        { problem_id: Number(id), voter_id: voterId },
        { onConflict: "problem_id,voter_id", ignoreDuplicates: true }
      );
    if (error) throw error;

    res.json({ liked_by_me: true, likes_count: await getLikesCount(Number(id)) });
  } catch (error) {
    serverError(res, error);
  }
});

// 5. 공감 취소 (DELETE /api/problems/:id/likes/me)
router.delete("/:id/likes/me", async (req, res) => {
  const { id } = req.params;
  const voterId = getVoterId(req);
  if (!isValidId(id)) return res.status(400).json({ error: "잘못된 ID입니다." });
  if (!voterId) return res.status(400).json({ error: "X-Voter-Id 헤더가 필요합니다." });

  try {
    if ((await getLikesCount(Number(id))) === null) {
      return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
    }

    const { error } = await supabase
      .from("empathies")
      .delete()
      .eq("problem_id", Number(id))
      .eq("voter_id", voterId);
    if (error) throw error;

    res.json({ liked_by_me: false, likes_count: await getLikesCount(Number(id)) });
  } catch (error) {
    serverError(res, error);
  }
});

// ---------- 댓글 ----------

// 6. 댓글 목록 (GET /api/problems/:id/comments)
router.get("/:id/comments", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "잘못된 ID입니다." });

  try {
    if ((await getLikesCount(Number(id))) === null) {
      return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
    }

    const { data, error } = await supabase
      .from("comments")
      .select("id, content, author_name, created_at")
      .eq("problem_id", Number(id))
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    res.json(data);
  } catch (error) {
    serverError(res, error);
  }
});

// 7. 댓글 작성 (POST /api/problems/:id/comments)
router.post("/:id/comments", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body ?? {};
  if (!isValidId(id)) return res.status(400).json({ error: "잘못된 ID입니다." });

  if (typeof content !== "string" || !content.trim() || content.trim().length > COMMENT_MAX) {
    return res.status(400).json({ error: `댓글은 1~${COMMENT_MAX}자로 입력해주세요.` });
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({ problem_id: Number(id), content: content.trim() })
    .select("id, content, author_name, created_at")
    .single();

  if (error?.code === "23503") {
    return res.status(404).json({ error: "해당 불편함을 찾을 수 없습니다." });
  }
  if (error) return serverError(res, error);

  res.status(201).json(data);
});

module.exports = router;