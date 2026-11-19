const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createAuthRouter}=require('../src/routes/auth');
test('refresh restores sessions after expiration or server restart and rejects invalid credentials',async t=>{
 const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{name:'Student'}};}};}};
 let count=0;
 const data=expired=>({user:{id:'student-1',email:'student@example.com'},session:{access_token:'private',refresh_token:'valid-refresh',expires_at:Math.floor(Date.now()/1000)+(expired?-10:3600)}});
 const factory=()=>({auth:{async signInWithPassword(){return {data:data(true)};},async refreshSession({refresh_token}){count++;return refresh_token==='valid-refresh'?{data:data(false)}:{error:{status:400}};}}});
 async function server(){const app=express();app.use(express.json());const router=createAuthRouter(db,factory);app.use('/auth',router);app.get('/public',router.optionalAuth,(req,res)=>res.json({user:req.user}));const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>s.close());return `http://127.0.0.1:${s.address().port}`;}
 const first=await server();const second=await server();
 const post=(base,path,body,token)=>fetch(base+'/auth'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const initial=await (await post(first,'/login',{email:'student@example.com',password:'test-password'})).json();
 assert.equal(initial.refreshToken,'valid-refresh');
 assert.equal((await fetch(first+'/auth/me',{headers:{Authorization:'Bearer '+initial.accessToken}})).status,401);
 const refreshed=await (await post(first,'/refresh',{refreshToken:initial.refreshToken},initial.accessToken)).json();
 assert.equal(refreshed.user.id,'student-1');
 assert.equal((await fetch(first+'/auth/me',{headers:{Authorization:'Bearer '+refreshed.accessToken}})).status,200);
 assert.equal((await fetch(second+'/public',{headers:{Authorization:'Bearer '+refreshed.accessToken}})).status,401);
 assert.equal((await fetch(second+'/public')).status,200);
 const restored=await (await post(second,'/refresh',{refreshToken:refreshed.refreshToken},refreshed.accessToken)).json();
 assert.equal((await fetch(second+'/auth/me',{headers:{Authorization:'Bearer '+restored.accessToken}})).status,200);
 assert.notEqual(restored.accessToken,refreshed.accessToken);
 assert.equal((await post(second,'/refresh',{refreshToken:'invalid'})).status,401);
 assert.equal((await post(second,'/refresh',{})).status,401);
 assert.equal(count,3);
 await post(second,'/logout',{},restored.accessToken);
 assert.equal((await fetch(second+'/auth/me',{headers:{Authorization:'Bearer '+restored.accessToken}})).status,401);
});
