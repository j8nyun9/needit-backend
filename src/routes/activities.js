const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

// 활동 목록 조회 (GET /api/activities)
// 응답 형식: { data: Activity[] }  ← 프론트 명세(ActivityListResponse)에 맞춤
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("activities")
    .select(`
      id, category_label, title,
      application_start, application_end, application_note,
      eligibility, completion_policy, source_url, is_demo, weights
    `)
    .order("application_end", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // weights(ContributionCategory)는 아직 정해지지 않아서 항상 객체로 보냄 (기본 {})
  const activities = (data || []).map((activity) => ({
    ...activity,
    weights:
      activity.weights && typeof activity.weights === "object" && !Array.isArray(activity.weights)
        ? activity.weights
        : {}
  }));

  res.json({ data: activities });
});

module.exports = router;
