const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createAccountRouter,allRows}=require('../src/services/account');
function mock(){
 const users={alice:{id:'alice',email:'alice@example.com',user_metadata:{name:'Alice',other:'keep'}},bob:{id:'bob',email:'bob@example.com',user_metadata:{name:'Bob'}}};
 const tables={profiles:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}],problems:[{id:1,title:'Old own post',content:'Own body',author_id:'alice',created_at:'2026-01-01'},{id:2,title:'Liked post',content:'Other body',author_id:'bob',created_at:'2026-02-01'},...Array.from({length:101},(_,i)=>({id:i+3,author_id:'bob',title:'New post',created_at:'2026-11-01'}))],empathies:[{problem_id:2,voter_id:'alice',created_at:'2026-11-02'}],projects:[{id:1,title:'Owned project',owner_id:'alice',created_at:'2026-03-01'},{id:2,title:'Watched project',owner_id:'bob',created_at:'2026-04-01'}],project_favorites:[{project_id:2,user_id:'alice',created_at:'2026-11-03'}]};
 return {users,from(table){let filters=[],single=false;const q={select(){return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},in(k,vs){filters.push(r=>vs.some(v=>String(v)===String(r[k])));return q;},order(){return q;},range(a,b){return Promise.resolve({data:tables[table].filter(r=>filters.every(f=>f(r))).slice(a,b+1)});},maybeSingle(){single=true;return q;},then(resolve,reject){const rows=tables[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]:rows}).then(resolve,reject);}};return q;},auth:{admin:{async getUserById(id){return {data:{user:users[id]}};},async updateUserById(id,patch){users[id]={...users[id],...patch};return {data:{user:users[id]}};}}}};
}
test('account data and edited profile survive a fresh request/router without using the public 100-post list',async t=>{
 const db=mock();
 async function server(){const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.get('x-user');if(id)req.user={id,name:id,email:id+'@example.com'};next();});app.use('/account',createAccountRouter(db));const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>s.close());return `http://127.0.0.1:${s.address().port}/account`;}
 const base=await server();const request=(url,user,body)=>fetch(url,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request(base)).status,401);
 const first=await (await request(base,'alice')).json();assert.equal(first.profile.name,'Alice');assert.equal(first.problems.find(p=>p.id===1).mine,true);assert.equal(first.problems.find(p=>p.id===2).liked_by_me,true);assert.equal(first.problems.find(p=>p.id===2).likes_count,1);assert.equal(first.problems.length,2);assert.equal(first.problems[0].author_id,undefined);
 assert.equal(first.projects.find(p=>p.id===1).can_edit,true);assert.equal(first.projects.find(p=>p.id===2).interested,true);assert.equal(first.activity.length,4);
 const draft={name:'New Alice',bio:'Saved introduction',department:'Computer Science',year:'2',school:'University',id:'bob',email:'hacked@example.com'};
 const updated=await (await request(base+'/profile','alice',draft)).json();assert.equal(updated.id,'alice');assert.equal(updated.email,'alice@example.com');assert.equal(updated.bio,'Saved introduction');assert.equal(db.users.alice.user_metadata.other,'keep');assert.equal(db.users.bob.user_metadata.needit_profile,undefined);
 const restarted=await server();const restored=await (await request(restarted,'alice')).json();assert.equal(restored.profile.name,'New Alice');assert.equal(restored.profile.school,'University');assert.deepEqual(restored.problems,first.problems);assert.deepEqual(restored.projects,first.projects);assert.deepEqual(restored.activity,first.activity);
 assert.equal((await request(base+'/profile','alice',{...draft,name:' '})).status,400);
 assert.equal((await request(base+'/profile','alice',{...draft,bio:'x'.repeat(151)})).status,400);
 const other=await (await request(base,'bob')).json();assert.equal(other.profile.name,'Bob');assert.equal(other.problems.find(p=>p.id===1),undefined);assert.equal(other.projects.find(p=>p.id===1),undefined);
});
test('user-specific pagination includes records beyond the first database page',async()=>{
 const source=Array.from({length:1001},(_,i)=>({id:i}));let calls=0;
 const rows=await allRows(()=>({async range(a,b){calls++;return {data:source.slice(a,b+1)};}}));assert.equal(rows.length,1001);assert.equal(calls,2);
});
test('project or profile service failure does not hide successfully loaded posts',async t=>{
 const db=mock();const original=db.from.bind(db);
 db.auth.admin.getUserById=async()=>({error:{code:'AUTH_TEMPORARY'}});
 db.from=table=>!['project_favorites','projects'].includes(table)?original(table):{select(){return this;},eq(){return this;},order(){return this;},async range(){return {error:{code:'MISSING_TABLE'}};}};
 const app=express();app.use((req,res,next)=>{req.user={id:'alice',name:'Alice',email:'alice@example.com'};next();});app.use('/account',createAccountRouter(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const response=await fetch(`http://127.0.0.1:${server.address().port}/account`);assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.profile.id,'alice');assert.equal(data.problems.find(p=>p.id===1).mine,true);assert.equal(data.problems.find(p=>p.id===2).liked_by_me,true);assert.equal(data.projects.length,0);
 assert.ok(data.unavailable.includes('profile'));assert.ok(data.unavailable.includes('favorites'));assert.ok(data.unavailable.includes('managed'));assert.equal(data.warnings.length,3);
});
