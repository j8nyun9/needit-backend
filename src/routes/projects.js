const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

// 1. 프로젝트 목록 조회 (GET /api/projects)
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, summary, status, progress")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// 2. 프로젝트 상세 조회 (GET /api/projects/:id)
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "잘못된 프로젝트 ID입니다." });
  }

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id, title, summary, status, progress,
      description, features, team_name, github_url, deployment_url, tech_stack,
      project_problems ( problems ( id, title, category ) )
    `)
    .eq("id", Number(id))
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
  }

  // 연결 테이블 구조를 명세 형태(related_problems)로 바꾸기
  const { project_problems, ...project } = data;
  const related_problems = (project_problems || [])
    .map((row) => row.problems)
    .filter(Boolean);

  res.json({
    ...project,
    features: project.features || [],
    tech_stack: project.tech_stack || [],
    related_problems
  });
});

module.exports = router;
