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
 async function decorate(rows,user){
  const favorites=user?await result(db.from('project_favorites').select('project_id').eq('user_id',user.id)):[];
  return rows.map(({owner_id,...p})=>({...p,can_edit:Boolean(user&&owner_id===user.id),interested:favorites.some(f=>String(f.project_id)===String(p.id))}));
 }
 router.get('/',async(req,res,next)=>{try{
  const rows=await result(db.from('projects').select('*').order('created_at',{ascending:false}).limit(100));
  const links=await result(db.from('project_problems').select('project_id,problem_id'));
  res.json((await decorate(rows,req.user)).map(p=>({...p,problem_ids:links.filter(l=>String(l.project_id)===String(p.id)).map(l=>l.problem_id)})));
 }catch(e){next(e);}});
 router.post('/',login,async(req,res,next)=>{try{
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
  const feedback=await result(db.from('project_feedback').select('id,kind,content,author_name,created_at').eq('project_id',p.id).order('created_at',{ascending:false}).limit(100));
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
  const {kind,content}=req.body||{};
  if(!['review','bug'].includes(kind)||typeof content!=='string'||!content.trim()||content.length>1000)return res.status(400).json({error:'종류와 내용을 확인해주세요. 최대 1,000자까지 작성할 수 있어요.'});
  if(!await project(req.params.id))return res.sendStatus(404);
  const row=await result(db.from('project_feedback').insert({project_id:req.params.id,user_id:req.user.id,author_name:req.user.name,kind,content:content.trim()}).select('id,kind,content,author_name,created_at').single());
  res.status(201).json(row);
 }catch(e){next(e);}});
 router.use((e,req,res,next)=>{console.error('Project API:',e.code||e.message);res.status(500).json({error:'프로젝트 정보를 처리하지 못했어요. 서버 로그와 프로젝트 배포 기능 DB 설정을 확인해주세요.'});});
 return router;
}
module.exports={createProjectsRouter,safeUrl,statuses};
