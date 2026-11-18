const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

const CATEGORIES = ["시설", "도서관", "학사·행정", "학교생활", "기타"];
const TITLE_MAX = 100;
const CONTENT_MAX = 1000;

// 1. 불편함 목록 조회
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("problems")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.json(data);
});

// 2. 새로운 불편함 등록
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
    .insert({
      title: title.trim(),
      content: content.trim(),
      category: category.trim()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.status(201).json(data);
});

module.exports = router;
