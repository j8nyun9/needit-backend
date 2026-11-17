const supabase = require('../config/supabase');

async function getProblems() {
  const { data, error } = await supabase
    .from('problems')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createProblem({ title, content, category }) {
  const { data, error } = await supabase
    .from('problems')
    .insert({ title, content, category })
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = { getProblems, createProblem };
