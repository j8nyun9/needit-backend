const express = require('express');
const statuses = ['기획 중', '개발 중', '테스트 중', '서비스 운영 중'];
function safeUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2000) return null;
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const TITLE_MAX=100,DESCRIPTION_MAX=5000,FEATURES_MAX=10,FEATURE_MAX=250;
// Returns the cleaned project draft, or null when any field breaks the API contract.
function parseAdoption(body){
 const {problem_id,title,description,features}=body||{};
 const problemId=typeof problem_id==='string'&&/^\d+$/.test(problem_id)?Number(problem_id):problem_id;
 if(!Number.isSafeInteger(problemId)||problemId<=0)return null;
 if(typeof title!=='string'||typeof description!=='string')return null;
 const t=title.trim(),d=description.trim();
 if(!t||t.length>TITLE_MAX||!d||d.length>DESCRIPTION_MAX)return null;
 if(features!==undefined&&features!==null&&!Array.isArray(features))return null;
 const list=(features||[]).map(f=>typeof f==='string'?f.trim():null);
 if(list.length>FEATURES_MAX||list.some(f=>!f||f.length>FEATURE_MAX))return null;
 return {problemId,title:t,description:d,features:list};
}
function canReceiveFeedback(p){return p.release_status===statuses[3];}
async function result(query) { const {data,error}=await query; if(error) throw error; return data; }
// 일정 필드 검사: YYYY-MM-DD 형식이면서 실제로 있는 날짜
function isCalendarDate(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
}
// 둘 다 null이면 일정 지우기, 둘 다 있으면 완료일 >= 기준일. 그 외는 null(잘못된 값)
function parseSchedule(body){
 const start=body?.progress_started_on??null, end=body?.expected_completion_date??null;
 if(start===null&&end===null)return {progress_started_on:null,expected_completion_date:null};
 if(!isCalendarDate(start)||!isCalendarDate(end)||end<start)return null;
 return {progress_started_on:start,expected_completion_date:end};
}

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
    return { ...p, can_feedback: canReceiveFeedback(p), can_edit: mine, interested: has(favorites, p.id), is_bookmarked: has(favorites, p.id), is_member: mine || has(members, p.id) };
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

 router.post('/',login,async(req,res,next)=>{try{
  if(Object.prototype.hasOwnProperty.call(req.body||{},'problem_id')){
  const draft=parseAdoption(req.body);
  if(!draft)return res.status(400).json({error:`입력값을 확인해주세요. 제목 ${TITLE_MAX}자, 설명 ${DESCRIPTION_MAX}자 이내이고 기능은 최대 ${FEATURES_MAX}개, 항목당 ${FEATURE_MAX}자까지 입력할 수 있어요.`});
    // 선택 필드: 완료 예정일·기준일 (둘 다 없으면 일정 없이 등록)
  const body=req.body||{};
  const wantsSchedule=body.expected_completion_date!=null;
  if(body.release_status!==undefined&&!statuses.includes(body.release_status))return res.status(400).json({error:'프로젝트 상태를 확인해주세요.'});
  if(body.release_status===statuses[3]&&!safeUrl(body.deployment_url))return res.status(400).json({error:'운영 중인 서비스 주소를 입력해주세요.'});
  const schedule=wantsSchedule&&isCalendarDate(body.expected_completion_date)?{expected_completion_date:body.expected_completion_date}:null;
  if(wantsSchedule&&!schedule)return res.status(400).json({error:'날짜는 YYYY-MM-DD 형식이고, 완료 예정일은 기준일과 같거나 이후여야 해요.'});

  // Plan ownership, project insert and problem link are checked/written in one DB transaction.
  const {data,error}=await db.rpc('create_project_from_problem',{p_user_id:req.user.id,p_problem_id:draft.problemId,p_title:draft.title,p_description:draft.description,p_features:draft.features});
  if(error){console.error('Project adoption failed:',error.code||'DB_ERROR');return res.status(503).json({error:'프로젝트를 등록하지 못했어요. 잠시 후 다시 시도해주세요. 계속되면 프로젝트 채택 DB 설정을 확인해주세요.'});}
  if(data?.status==='already_exists'&&data.project){
   const [existing]=await decorate([data.project],req.user);
   return res.status(409).json({error:'이미 채택한 불편함이에요. 내 프로젝트를 확인해주세요.',project:{...existing,problem_ids:[draft.problemId]}});
  }
  if(data?.status==='not_found')return res.status(404).json({error:'원본 불편함을 찾을 수 없어요.'});
  if(data?.status==='forbidden')return res.status(403).json({error:'이 불편함에 대한 내 AI 기획안이 있어야 프로젝트를 등록할 수 있어요.'});
  if(data?.status!=='created'||!data.project)return res.status(503).json({error:'등록 결과를 확인하지 못했어요. 프로젝트 목록을 다시 불러와 확인해주세요.'});
  let created=data.project;
  if(schedule){
   created=await result(db.from('projects').update(schedule).eq('id',created.id).select('*').single());
  }
  const [project]=await decorate([created],req.user);

  return res.status(201).json({...project,problem_ids:[draft.problemId]});
  }
  if(!Object.prototype.hasOwnProperty.call(req.body||{},'deployment_url')){
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
  return res.status(201).json({ ...(await decorate([saved], req.user))[0], problem_ids: problemId ? [Number(problemId)] : [], related_problem_id: problemId ? Number(problemId) : null });

  }
  const {title,description,deployment_url,usage_guide='',team_name='',github_url=''}=req.body||{};
  const url=safeUrl(deployment_url);const github=safeUrl(github_url);
  if(typeof title!=='string'||!title.trim()||title.trim().length>100||typeof description!=='string'||!description.trim()||description.trim().length>3000||typeof deployment_url!=='string'||!url||github===null||typeof github_url!=='string'||typeof usage_guide!=='string'||usage_guide.length>5000||typeof team_name!=='string'||team_name.length>100)return res.status(400).json({error:'서비스 이름, 소개, 올바른 서비스 주소를 입력해주세요.'});
  // Register a completed service. Ownership always comes from the verified session.
  const row=await result(db.from('projects').insert({title:title.trim(),summary:description.trim().slice(0,300),description:description.trim(),status:'개발 중',progress:100,release_status:statuses[3],deployment_url:url,usage_guide:usage_guide.trim(),team_name:team_name.trim(),github_url:github,owner_id:req.user.id,released_at:new Date().toISOString()}).select().single());
  res.status(201).json({...((await decorate([row],req.user))[0]),problem_ids:[],related_problems:[],feedback:[]});
 }catch(e){next(e);}});
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
 router.post('/:id/unpublish',login,async(req,res,next)=>{try{
  const p=await project(req.params.id);if(!p)return res.status(404).json({error:'프로젝트를 찾을 수 없어요.'});
  if(p.owner_id!==req.user.id)return res.status(403).json({error:'프로젝트 담당자만 공개를 취소할 수 있어요.'});
  if(p.release_status!==statuses[3])return res.json((await decorate([p],req.user))[0]);
  const saved=await result(db.from('projects').update({release_status:statuses[2],released_at:null}).eq('id',p.id).eq('owner_id',req.user.id).eq('release_status',statuses[3]).select().maybeSingle());
  const current=saved||await project(p.id);
  if(!current)return res.status(404).json({error:'프로젝트를 찾을 수 없어요.'});
  if(current.owner_id!==req.user.id)return res.status(403).json({error:'프로젝트 담당자만 공개를 취소할 수 있어요.'});
  res.json((await decorate([current],req.user))[0]);
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
  const p=await project(req.params.id);
  if(!p)return res.sendStatus(404);
  if(!canReceiveFeedback(p))return res.status(403).json({error:'완료된 프로젝트에만 피드백을 작성할 수 있어요.'});
  const row=await result(db.from('project_feedback').insert({project_id:req.params.id,user_id:req.user.id,author_name:req.user.name,kind,content:content.trim()}).select('id,kind,content,author_name,created_at').single());
  res.status(201).json({...row,can_edit:true,can_delete:true});
 }catch(e){next(e);}});
  // 프로젝트 등록 (POST /api/projects)

 // 진행률·예정일·배포 주소 수정 (PATCH /api/projects/:id)
 const validDate = v => v === null || isCalendarDate(v);
 router.patch('/:id', login, async (req, res, next) => { try {
  const p = await project(req.params.id); if (!p) return res.sendStatus(404);
  if (p.owner_id !== req.user.id) return res.status(403).json({ error: '프로젝트 담당자만 수정할 수 있어요.' });
  const body = req.body || {}; const patch = {};
  if ('expected_completion_date' in body) {
    if(body.expected_completion_date!==null&&!isCalendarDate(body.expected_completion_date))return res.status(400).json({error:'올바른 개발 완료 예정일을 선택해주세요.'});
    patch.expected_completion_date=body.expected_completion_date;
  }
  if ('release_status' in body) {
    if(!statuses.includes(body.release_status))return res.status(400).json({error:'프로젝트 상태를 확인해주세요.'});
    if(body.release_status===statuses[3]&&!safeUrl(body.deployment_url??p.deployment_url))return res.status(400).json({error:'서비스 운영 중으로 변경하려면 서비스 주소를 등록해주세요.'});
    patch.release_status=body.release_status;
    if(body.release_status===statuses[3]&&p.release_status!==statuses[3])patch.released_at=new Date().toISOString();
    if(body.release_status!==statuses[3])patch.released_at=null;
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
  const rows = await result(db.from('project_feedback').select('id,kind,content,author_name,created_at,user_id').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100));
  if (!rows.length) return [];
  const all = await result(db.from('project_feedback_reactions').select('feedback_id,user_id,reaction').in('feedback_id', rows.map(r => r.id)));
  return rows.map(({user_id,...r}) => {
    const list = all.filter(x => String(x.feedback_id) === String(r.id));
    return { ...r, can_edit:Boolean(user&&user_id===user.id),can_delete:Boolean(user&&user_id===user.id), author: r.author_name,
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


 async function ownedFeedback(req,res){
  if(!/^\d+$/.test(req.params.feedbackId)){res.status(400).json({error:'잘못된 피드백 ID예요.'});return null;}
  const row=await result(db.from('project_feedback').select('id,user_id').eq('id',req.params.feedbackId).eq('project_id',req.params.id).maybeSingle());
  if(!row){res.status(404).json({error:'피드백을 찾을 수 없어요.'});return null;}
  if(row.user_id!==req.user.id){res.status(403).json({error:'본인이 작성한 후기·오류 제보만 수정하거나 삭제할 수 있어요.'});return null;}
  return row;
 }
 router.patch('/:id/feedback/:feedbackId',login,async(req,res,next)=>{try{
  if(!await ownedFeedback(req,res))return;
  const {kind,content}=req.body||{};
  if(!['review','bug'].includes(kind)||typeof content!=='string'||!content.trim()||content.length>1000)return res.status(400).json({error:'종류와 내용을 확인해주세요. 최대 1,000자까지 작성할 수 있어요.'});
  const row=await result(db.from('project_feedback').update({kind,content:content.trim()}).eq('id',req.params.feedbackId).eq('project_id',req.params.id).eq('user_id',req.user.id).select('id,kind,content,author_name,created_at').maybeSingle());
  if(!row)return res.sendStatus(404);
  res.json({...row,can_edit:true,can_delete:true});
 }catch(e){next(e);}});
 router.delete('/:id/feedback/:feedbackId',login,async(req,res,next)=>{try{
  if(!await ownedFeedback(req,res))return;
  const row=await result(db.from('project_feedback').delete().eq('id',req.params.feedbackId).eq('project_id',req.params.id).eq('user_id',req.user.id).select('id').maybeSingle());
  if(!row)return res.sendStatus(404);
  res.sendStatus(204);
 }catch(e){next(e);}});

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
module.exports={createProjectsRouter,safeUrl,statuses,parseAdoption};
