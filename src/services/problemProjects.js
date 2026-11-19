const { safeUrl, statuses } = require('./projectRelease');

// Select embedding the adopting project, used by the problem list/detail queries.
const PROBLEM_WITH_PROJECT = '*, project_problems ( project_id )';

// Several projects may adopt one problem. PostgREST returns an array, or a single
// object/null if a one-to-one constraint exists, so accept both shapes.
function linkList(link) {
  return (Array.isArray(link) ? link : link ? [link] : []).filter(l => l?.project_id != null);
}

function withProjectId(row) {
  const { project_problems: link, ...problem } = row;
  const links = linkList(link);
  // project_id stays stable: the earliest (lowest id) linked project.
  const first = links.map(l => l.project_id).sort((a, b) => Number(a) - Number(b))[0];
  return {
    problem,
    project_id: first ?? null,
    project_ids: [...new Set(links.map(l => String(l.project_id)))]
  };
}

// A project counts as deployed only while it is in service with a usable public URL.
function isDeployed(project) {
  return project?.release_status === statuses[3] && Boolean(safeUrl(project.deployment_url));
}

// Per-problem counts of distinct linked projects and of deployed ones.
// If project rows cannot be read, the list still renders with deployed counts of 0.
async function projectCounts(db, linkedRows) {
  const ids = [...new Set(linkedRows.flatMap(r => r.project_ids))];
  const deployed = new Set();
  if (ids.length) {
    const { data, error } = await db.from('projects').select('id,release_status,deployment_url').in('id', ids);
    if (error) console.error('Project counts unavailable:', error.code || 'DB_ERROR');
    else (data || []).filter(isDeployed).forEach(p => deployed.add(String(p.id)));
  }
  return new Map(linkedRows.map(r => [String(r.problem.id), {
    project_count: r.project_ids.length,
    deployed_project_count: r.project_ids.filter(id => deployed.has(id)).length
  }]));
}

module.exports = { PROBLEM_WITH_PROJECT, withProjectId, isDeployed, projectCounts };
