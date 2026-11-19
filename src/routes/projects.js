const { createProjectsRouter } = require('../services/projectRelease');
module.exports = createProjectsRouter(require('../config/supabase'));
