// Select embedding the adopting project, used by the problem list/detail queries.
const PROBLEM_WITH_PROJECT = '*, project_problems ( project_id )';

// PostgREST returns the embed as an array before the UNIQUE(problem_id) migration
// and as a single object (or null) after it, so accept both shapes.
function withProjectId(row) {
  const { project_problems: link, ...problem } = row;
  const first = Array.isArray(link) ? link[0] : link;
  return { problem, project_id: first?.project_id ?? null };
}

module.exports = { PROBLEM_WITH_PROJECT, withProjectId };
