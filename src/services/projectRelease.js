const express = require('express');
const statuses = ['기획 중', '개발 중', '테스트 중', '서비스 운영 중'];
function safeUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2000) return null;
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
async function result(query) { const {data,error}=await query; if(error) throw error; return data; }
function createProjectsRouter(db) {
 const router=express.Router();
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');next();});
 const login=(req,res,next)=>req.user?next():res.status(401).json({error:'로그인이 필요해요.'});
 router.param('id',(req,res,next,id)=>/^\d+$/.test(id)?next():res.status(400).json({error:'잘못된 프로젝트 ID예요.'}));
 const project=id=>result(db.from('projects').select('*').eq('id',id).maybeSingle());
 async function decorate(rows, user) {
  const favorites = user ? await result(db.from('project_favorites').select('project_id').eq('user_id', user.id)) : [];
  const members = user ? await result(db.from('project_members').select('project_id').eq('user_id', user.id)) : [];
  const has = (list, id) => list.some(r => String(r.project_id) === String(id));
  return rows.map(({ owner_id, ...p }) => {
    const mine = Boolean(user && owner_id === user.id);
    return { ...p, can_edit: mine, interested: has(favorites, p.id), is_bookmarked: has(favorites, p.id), is_member: mine || has(members, p.id) };
  });
 }

  router.get('/', async (req, res, next) => { try {
  const filter = req.query.related_problem_id;
  if (filter !== undefined && !/^\d+$/.test(filter)) return res.status(400).json({ error: '잘못된 불편함 ID예요.' });
  const links = await result(db.from('project_problems').select('project_id,problem_id'));
  let query = db.from('projects').select('*').order('created_at', { ascending: false }).limit(100);
  if (filter) {
    const ids = links.filter(l => String(l.problem_id) === filter).map(l => l.project_id);
    if (!ids.length) return res.json([]);
    query = query.in('id', ids);
  }
  const rows = await result(query);
  res.json((await decorate(rows, req.user)).map(p => {
    const problem_ids = links.filter(l => String(l.project_id) === String(p.id)).map(l => l.problem_id);
    return { ...p, problem_ids, related_problem_id: problem_ids[0] ?? null };
  }));
 } catch (e) { next(e); } });

 router.get('/notifications',login,async(req,res,next)=>{try{
  const favorites=await result(db.from('project_favorites').select('project_id').eq('user_id',req.user.id));
  const empathy=await result(db.from('empathies').select('problem_id').eq('voter_id',req.user.id));
  const links=empathy.length?await result(db.from('project_problems').select('project_id').in('problem_id',empathy.map(e=>e.problem_id))):[];
  const ids=[...new Set([...favorites,...links].map(f=>f.project_id))];
  const rows=ids.length?await result(db.from('projects').select('id,title,released_at').in('id',ids).eq('release_status','서비스 운영 중').not('released_at','is',null).order('released_at',{ascending:false}).limit(50)):[];
  const seen=await result(db.from('project_notification_reads').select('project_id,released_at').eq('user_id',req.user.id));
  res.json(rows.map(p=>({...p,read:seen.some(s=>String(s.project_id)===String(p.id)&&s.released_at===p.released_at)})));
 }catch(e){next(e);}});
 router.post('/:id/read',login,async(req,res,next)=>{try{
  const p=await project(req.params.id);if(!p)return res.sendStatus(404);
  if(p.released_at)await result(db.from('project_notification_reads').upsert({user_id:req.user.id,project_id:p.id,released_at:p.released_at}));
  res.sendStatus(204);
 }catch(e){next(e);}});
 router.get('/:id',async(req,res,next)=>{try{
  const p=await project(req.params.id);if(!p)return res.status(404).json({error:'프로젝트를 찾을 수 없어요.'});
  const links=await result(db.from('project_problems').select('problems(id,title,category)').eq('project_id',p.id));
  const feedback=await feedbackWithReactions(p.id,req.user);

  res.json({...((await decorate([p],req.user))[0]),related_problems:links.map(l=>l.problems).filter(Boolean),feedback});
 }catch(e){next(e);}});
 router.put('/:id',login,async(req,res,next)=>{try{
  const p=await project(req.params.id);if(!p)return res.sendStatus(404);
  if(p.owner_id!==req.user.id)return res.status(403).json({error:'프로젝트 담당자만 수정할 수 있어요.'});
  const {release_status,usage_guide,deployment_url}=req.body||{};const url=safeUrl(deployment_url);
  if(!statuses.includes(release_status)||typeof deployment_url!=='string'||url===null||typeof usage_guide!=='string'||usage_guide.length>5000||(release_status===statuses[3]&&!url))return res.status(400).json({error:'상태와 사용 방법, 서비스 주소를 확인해주세요. 운영 중에는 서비스 주소가 필요해요.'});
  const patch={release_status,deployment_url:url,usage_guide:usage_guide.trim()};
  if(release_status===statuses[3]&&p.release_status!==statuses[3])patch.released_at=new Date().toISOString();
  const saved=await result(db.from('projects').update(patch).eq('id',p.id).eq('owner_id',req.user.id).select().single());
  res.json((await decorate([saved],req.user))[0]);
 }catch(e){next(e);}});
 router.put('/:id/favorite',login,async(req,res,next)=>{try{
  if(typeof req.body?.interested!=='boolean')return res.status(400).json({error:'관심 등록 여부를 확인해주세요.'});
  if(!await project(req.params.id))return res.sendStatus(404);
  if(req.body.interested)await result(db.from('project_favorites').upsert({user_id:req.user.id,project_id:req.params.id}));
  else await result(db.from('project_favorites').delete().eq('user_id',req.user.id).eq('project_id',req.params.id));
  res.json({interested:req.body.interested});
 }catch(e){next(e);}});
 router.post('/:id/feedback',login,async(req,res,next)=>{try{
    const {kind='review',content}=req.body||{};
  if(!['review','bug'].includes(kind)||typeof content!=='string'||!content.trim()||content.length>1000)return res.status(400).json({error:'종류와 내용을 확인해주세요. 최대 1,000자까지 작성할 수 있어요.'});
  if(!await project(req.params.id))return res.sendStatus(404);
  const row=await result(db.from('project_feedback').insert({project_id:req.params.id,user_id:req.user.id,author_name:req.user.name,kind,content:content.trim()}).select('id,kind,content,author_name,created_at').single());
  res.status(201).json(row);
 }catch(e){next(e);}});
  // 프로젝트 등록 (POST /api/projects)
 router.post('/', login, async (req, res, next) => { try {
  const { title, description = '', related_problem_id = null } = req.body || {};
  const problemId = related_problem_id === null ? null : String(related_problem_id);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      typeof description !== 'string' || description.length > 5000 ||
      (problemId !== null && !/^\d+$/.test(problemId)))
    return res.status(400).json({ error: '제목(100자)과 설명(5,000자)을 확인해주세요.' });
  if (problemId) {
    const problem = await result(db.from('problems').select('id').eq('id', problemId).maybeSingle());
    if (!problem) return res.status(404).json({ error: '연결할 불편함을 찾을 수 없어요.' });
  }
  const saved = await result(db.from('projects').insert({
    title: title.trim(), description: description.trim(), owner_id: req.user.id,
    release_status: '기획 중'
  }).select().single());
  if (problemId) await result(db.from('project_problems').insert({ project_id: saved.id, problem_id: Number(problemId) }));
  await result(db.from('project_members').insert({ project_id: saved.id, user_id: req.user.id, role: 'owner' }));
  res.status(201).json({ ...(await decorate([saved], req.user))[0], problem_ids: problemId ? [Number(problemId)] : [], related_problem_id: problemId ? Number(problemId) : null });
 } catch (e) { next(e); } });

 // 진행률·예정일·배포 주소 수정 (PATCH /api/projects/:id)
 const validDate = v => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));
 router.patch('/:id', login, async (req, res, next) => { try {
  const p = await project(req.params.id); if (!p) return res.sendStatus(404);
  if (p.owner_id !== req.user.id) return res.status(403).json({ error: '프로젝트 담당자만 수정할 수 있어요.' });
  const body = req.body || {}; const patch = {};
  if ('progress' in body) {
    if (!Number.isInteger(body.progress) || body.progress < 0 || body.progress > 100)
      return res.status(400).json({ error: '진행률은 0~100 사이 정수로 입력해주세요.' });
    patch.progress = body.progress;
  }
  if ('progress_started_on' in body || 'expected_completion_date' in body) {
    const s = body.progress_started_on ?? null, e = body.expected_completion_date ?? null;
    if (!validDate(s) || !validDate(e) || (s === null) !== (e === null) || (s && e < s))
      return res.status(400).json({ error: '날짜는 YYYY-MM-DD 형식으로, 시작일과 예정일을 함께 보내주세요.' });
    patch.progress_started_on = s; patch.expected_completion_date = e;
  }
  if ('deployment_url' in body) {
    const url = safeUrl(body.deployment_url);
    if (url === null) return res.status(400).json({ error: 'http(s) 서비스 주소를 확인해주세요.' });
    if (!url && p.release_status === statuses[3]) return res.status(400).json({ error: '운영 중인 서비스는 주소를 비울 수 없어요.' });
    patch.deployment_url = url;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: '변경할 값이 없어요.' });
  const saved = await result(db.from('projects').update(patch).eq('id', p.id).eq('owner_id', req.user.id).select().single());
  res.json((await decorate([saved], req.user))[0]);
 } catch (e) { next(e); } });

 // 의견 목록 + 반응 수
 async function feedbackWithReactions(projectId, user) {
  const rows = await result(db.from('project_feedback').select('id,kind,content,author_name,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100));
  if (!rows.length) return [];
  const all = await result(db.from('project_feedback_reactions').select('feedback_id,user_id,reaction').in('feedback_id', rows.map(r => r.id)));
  return rows.map(r => {
    const list = all.filter(x => String(x.feedback_id) === String(r.id));
    return { ...r, author: r.author_name,
      like_count: list.filter(x => x.reaction === 'like').length,
      dislike_count: list.filter(x => x.reaction === 'dislike').length,
      my_reaction: user ? (list.find(x => x.user_id === user.id)?.reaction ?? null) : null };
  });
 }

 // GET /api/projects/:id/feedback
 router.get('/:id/feedback', async (req, res, next) => { try {
  if (!await project(req.params.id)) return res.status(404).json({ error: '프로젝트를 찾을 수 없어요.' });
  res.json(await feedbackWithReactions(req.params.id, req.user));
 } catch (e) { next(e); } });

 // PUT /api/projects/:id/feedback/:feedbackId/reaction  { reaction: "like" | "dislike" | null }
 router.put('/:id/feedback/:feedbackId/reaction', login, async (req, res, next) => { try {
  const { feedbackId } = req.params; const reaction = req.body?.reaction;
  if (!/^\d+$/.test(feedbackId) || !(reaction === null || ['like', 'dislike'].includes(reaction)))
    return res.status(400).json({ error: '반응 값을 확인해주세요.' });
  const fb = await result(db.from('project_feedback').select('id').eq('id', feedbackId).eq('project_id', req.params.id).maybeSingle());
  if (!fb) return res.status(404).json({ error: '의견을 찾을 수 없어요.' });
  if (reaction === null) await result(db.from('project_feedback_reactions').delete().eq('feedback_id', feedbackId).eq('user_id', req.user.id));
  else await result(db.from('project_feedback_reactions').upsert({ feedback_id: Number(feedbackId), user_id: req.user.id, reaction }, { onConflict: 'feedback_id,user_id' }));
  const item = (await feedbackWithReactions(req.params.id, req.user)).find(r => String(r.id) === feedbackId);
  res.json({ like_count: item.like_count, dislike_count: item.dislike_count, my_reaction: item.my_reaction });
 } catch (e) { next(e); } });

 router.use((e,req,res,next)=>{console.error('Project API:',e.code||e.message);res.status(500).json({error:'프로젝트 정보를 처리하지 못했어요. 서버 로그와 프로젝트 배포 기능 DB 설정을 확인해주세요.'});});
 return router;
}
module.exports={createProjectsRouter,safeUrl,statuses};
