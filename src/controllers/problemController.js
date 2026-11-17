const problemService = require('../services/problemService');

async function list(req, res) {
  try {
    const problems = await problemService.getProblems();
    res.json(problems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function create(req, res) {
  const { title, content, category } = req.body;
  if (!title || !content || !category) {
    return res.status(400).json({ error: 'title, content, category는 필수입니다.' });
  }
  try {
    const problem = await problemService.createProblem({ title, content, category });
    res.status(201).json(problem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, create };
