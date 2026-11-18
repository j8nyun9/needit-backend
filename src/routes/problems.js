const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

const CATEGORIES = ["시설", "도서관", "학사·행정", "학교생활", "기타"];
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
  const { title, content, category } = req.body ?? {};

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
  res.status(201).json(data);
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