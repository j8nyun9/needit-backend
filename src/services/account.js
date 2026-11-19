const express=require('express');
const {hidePlan}=require('./personalPlans');
const {ownedProblem}=require('./problemOwnership');
const {empathySummary}=require('./problemEmpathies');
const fields={name:30,bio:150,department:50,year:20,school:80};
async function result(query){const {data,error}=await query;if(error)throw error;return data;}
async function allRows(query){
 const rows=[];
 for(let offset=0;;offset+=1000){const page=await result(query().range(offset,offset+999));rows.push(...page);if(page.length<1000)return rows;}
}
function profileFrom(authUser,profile,user){
 const details=authUser?.user_metadata?.needit_profile||{};
 return {id:user.id,email:authUser?.email||user.email,name:details.name||profile?.name||authUser?.user_metadata?.name||user.name,
  ...Object.fromEntries(['bio','department','year','school'].map(key=>[key,typeof details[key]==='string'?details[key]:'']))};
}
function createAccountRouter(db){
 const router=express.Router();
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');if(!req.user?.id)return res.status(401).json({error:'로그인 후 마이페이지를 확인해주세요.'});next();});
 async function profile(user){
  const {data,error}=await db.auth.admin.getUserById(user.id);if(error)throw error;
  const row=await result(db.from('profiles').select('id,name,email').eq('id',user.id).maybeSingle());
  return {authUser:data.user,profile:profileFrom(data.user,row,user)};
 }
 router.get('/',async(req,res,next)=>{try{
  const id=req.user.id;
  const warnings=[];const unavailable=new Set();
  async function section(key,task,fallback){try{return await task();}catch(error){console.error('Account section '+key+':',error.code||error.message);unavailable.add(key);warnings.push({section:key,message:({profile:'프로필',mine:'내가 등록한 불편함',liked:'공감한 불편함',favorites:'관심 프로젝트',managed:'담당 프로젝트',counts:'공감 개수'}[key]||'일부 정보')+' 정보를 불러오지 못했어요. 다시 불러오기를 눌러주세요.'});return fallback;}}
  const [identity,mine,votes,favorites,managed]=await Promise.all([
   section('profile',()=>profile(req.user),{profile:profileFrom(null,null,req.user)}),
   section('mine',()=>allRows(()=>db.from('problems').select('*').eq('author_id',id).order('created_at',{ascending:false}).order('id')),[]),
   section('liked',()=>allRows(()=>db.from('empathies').select('*').eq('voter_id',id).order('problem_id')),[]),
   section('favorites',()=>allRows(()=>db.from('project_favorites').select('*').eq('user_id',id).order('project_id')),[]),
   section('managed',()=>allRows(()=>db.from('projects').select('*').eq('owner_id',id).order('created_at',{ascending:false}).order('id')),[]),
  ]);
  const liked=[];const watched=[];
  const voteIds=[...new Set(votes.map(v=>v.problem_id))];const favoriteIds=[...new Set(favorites.map(f=>f.project_id))];
  for(let start=0;start<voteIds.length;start+=100)liked.push(...await section('liked',()=>result(db.from('problems').select('*').in('id',voteIds.slice(start,start+100))),[]));
  for(let start=0;start<favoriteIds.length;start+=100)watched.push(...await section('favorites',()=>result(db.from('projects').select('*').in('id',favoriteIds.slice(start,start+100))),[]));
  const uniqueProblems=[...new Map([...mine,...liked].map(p=>[String(p.id),p])).values()];
  const problems=[];
  for(let start=0;start<uniqueProblems.length;start+=100){
   const chunk=uniqueProblems.slice(start,start+100);const summary=await section('counts',()=>empathySummary(db,chunk.map(p=>p.id),id),new Map());
   problems.push(...chunk.map(p=>ownedProblem({...hidePlan(p),liked_by_me:voteIds.some(value=>String(value)===String(p.id)),likes_count:summary.get(String(p.id))?.count??p.likes_count??0},id)));
  }
  const projects=[...new Map([...managed,...watched].map(p=>[String(p.id),p])).values()].map(({owner_id,...p})=>({...p,can_edit:owner_id===id,interested:favoriteIds.some(f=>String(f)===String(p.id))}));
  const activity=[
   ...mine.map(p=>({key:'problem-'+p.id,icon:'pencil',title:'새로운 불편함을 등록했어요',text:p.title,created_at:p.created_at,type:'problem',id:p.id})),
   ...votes.flatMap(v=>{const p=liked.find(p=>String(p.id)===String(v.problem_id));return p?[{key:'like-'+p.id,icon:'heart',title:'불편함에 공감했어요',text:p.title,created_at:v.created_at||null,type:'problem',id:p.id}]:[];}),
   ...favorites.flatMap(f=>{const p=watched.find(p=>String(p.id)===String(f.project_id));return p?[{key:'favorite-'+p.id,icon:'folder',title:'프로젝트를 관심 등록했어요',text:p.title,created_at:f.created_at||null,type:'project',id:p.id}]:[];}),
   ...managed.map(p=>({key:'managed-'+p.id,icon:'code',title:'담당하고 있는 프로젝트예요',text:p.title,created_at:p.created_at,type:'project',id:p.id})),
  ].sort((a,b)=>(Date.parse(b.created_at||'')||0)-(Date.parse(a.created_at||'')||0));
  req.user.name=identity.profile.name;
  res.json({profile:identity.profile,problems,projects,activity,warnings,unavailable:[...unavailable]});
 }catch(e){next(e);}});
 router.put('/profile',async(req,res,next)=>{try{
  const input=req.body||{};const details={};
  for(const [key,max]of Object.entries(fields)){
   if(typeof input[key]!=='string'||input[key].trim().length>max||(key==='name'&&!input[key].trim()))return res.status(400).json({error:'프로필 입력값을 확인해주세요.'});
   details[key]=input[key].trim();
  }
  const current=await profile(req.user);
  const {data,error}=await db.auth.admin.updateUserById(req.user.id,{user_metadata:{...current.authUser.user_metadata,needit_profile:details}});
  if(error)throw error;
  const saved=profileFrom(data.user,null,req.user);req.user.name=saved.name;
  res.json(saved);
 }catch(e){next(e);}});
 router.use((e,req,res,next)=>{console.error('Account API:',e.code||e.message);res.status(503).json({error:'마이페이지 정보를 불러오거나 저장하지 못했어요. 잠시 후 다시 시도해주세요.'});});
 return router;
}
module.exports={createAccountRouter,profileFrom,allRows};
