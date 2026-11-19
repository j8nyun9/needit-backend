const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createProjectsRouter,safeUrl}=require('../src/services/projectRelease');

function mockDb(){
 const tables={projects:[{id:1,title:'Seat service',owner_id:'alice',release_status:'개발 중',created_at:'2026-01-01'}],project_favorites:[],project_problems:[{project_id:1,problem_id:7,problems:{id:7,title:'Seats'}}],empathies:[{voter_id:'bob',problem_id:7}],project_feedback:[],project_notification_reads:[]};
 return {tables,from(table){
  let filters=[],mode='select',payload,single=false;
  const q={select(){return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},in(k,vs){filters.push(r=>vs.some(v=>String(v)===String(r[k])));return q;},not(k,op,v){filters.push(r=>r[k]!=null);return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},update(v){mode='update';payload=v;return q;},insert(v){mode='insert';payload=v;return q;},upsert(v){mode='upsert';payload=v;return q;},delete(){mode='delete';return q;},then(resolve,reject){try{
   let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(mode==='update')rows.forEach(r=>Object.assign(r,payload));
   if(mode==='insert'){rows=[{id:tables[table].length+1,created_at:new Date().toISOString(),...payload}];tables[table].push(...rows);}
   if(mode==='upsert'){let row=tables[table].find(r=>r.user_id===payload.user_id&&String(r.project_id)===String(payload.project_id));if(row)Object.assign(row,payload);else tables[table].push({...payload});}
   if(mode==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
   return Promise.resolve({data:single?rows[0]||null:rows.map(r=>({...r})),error:null}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
 }};
}
test('service links reject script URLs and credentials',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('https://user:pass@example.com'),null);assert.equal(safeUrl('https://example.com'),'https://example.com/');});
test('release ownership, persisted feedback/favorites and per-user launch notifications',async t=>{
 const db=mockDb();const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('x-user'))req.user={id:req.get('x-user'),name:'Student'};next();});app.use('/projects',createProjectsRouter(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/projects`;
 const request=(path,user,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const publication={release_status:'서비스 운영 중',deployment_url:'https://example.com',usage_guide:'Open and search'};
 assert.equal((await request('/1',null,'PUT',publication)).status,401);
 assert.equal((await request('/1','bob','PUT',publication)).status,403);
 assert.equal((await request('/1','alice','PUT',{...publication,deployment_url:'javascript:alert(1)'})).status,400);
 assert.equal((await request('/1','alice','PUT',{...publication,deployment_url:''})).status,400);
 assert.equal((await request('/1','alice','PUT',publication)).status,200);
 assert.ok(db.tables.projects[0].released_at);
 const released=db.tables.projects[0].released_at;
 await request('/1','alice','PUT',{...publication,usage_guide:'Updated'});assert.equal(db.tables.projects[0].released_at,released);
 const publicRow=await (await request('/1')).json();assert.equal(publicRow.can_edit,false);assert.equal(publicRow.owner_id,undefined);assert.equal(publicRow.related_problems[0].id,7);
 assert.equal((await request('/1/feedback',null,'POST',{kind:'bug',content:'Issue'})).status,401);
 assert.equal((await request('/1/feedback','bob','POST',{kind:'bug',content:'  '})).status,400);
 assert.equal((await request('/1/feedback','bob','POST',{kind:'bug',content:'Broken on mobile'})).status,201);
 const detail=await (await request('/1','bob')).json();assert.equal(detail.feedback[0].content,'Broken on mobile');assert.equal(detail.feedback[0].author_name,'Student');
 await request('/1/favorite','alice','PUT',{interested:true});await request('/1/favorite','alice','PUT',{interested:true});assert.equal(db.tables.project_favorites.length,1);
 assert.equal((await (await request('/','alice')).json())[0].interested,true);
 const alerts=await (await request('/notifications','bob')).json();assert.equal(alerts.length,1);assert.equal(alerts[0].read,false);
 assert.equal((await (await request('/notifications','charlie')).json()).length,0);
 assert.equal((await request('/notifications')).status,401);
 await request('/1/read','bob','POST');assert.equal((await (await request('/notifications','bob')).json())[0].read,true);
 assert.equal((await (await request('/notifications','alice')).json())[0].read,false);
 await request('/1/favorite','alice','PUT',{interested:false});assert.equal(db.tables.project_favorites.length,0);
 assert.equal((await request('/bad-id')).status,400);assert.equal((await request('/999')).status,404);
});
