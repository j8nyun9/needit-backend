
const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

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
  const { title, content, category } = req.body;

  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof category !== "string" ||
    !title.trim() ||
    !content.trim() ||
    !category.trim() ||
    title.length > 100 ||
    content.length > 2000 ||
    category.length > 30
  ) {
    return res.status(400).json({
      error: "입력값을 확인해주세요."
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
