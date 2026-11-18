const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createAuthRouter}=require('../src/routes/auth');
test('Supabase Auth login, profile lookup, session validation and logout',async t=>{
 let calls=0;const db={from(table){assert.equal(table,'profiles');return {select(fields){assert.ok(!fields.includes('password'));return this;},eq(key,value){assert.equal(key,'id');assert.equal(value,'uuid-1');return this;},async maybeSingle(){return {data:{id:'uuid-1',name:'Student'},error:null};}}}};
 const factory=()=>{calls++;return {auth:{async signInWithPassword({email,password}){if(email!=='test@example.com'||password!=='test-pass')return {error:{status:400},data:null};return {error:null,data:{user:{id:'uuid-1',email,user_metadata:{name:'Fallback'}},session:{access_token:'supabase-private-token',expires_at:Math.floor(Date.now()/1000)+3600}}};}}};};
 const app=express();app.use(express.json());const auth=createAuthRouter(db,factory);app.use('/auth',auth);app.post('/protected',auth.requireAuth,(req,res)=>res.json({id:req.user.id}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/auth`;
 const protectedUrl=base.replace('/auth','/protected');assert.equal((await fetch(protectedUrl,{method:'POST'})).status,401);
 const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 assert.equal((await post('/login',{email:'test@example.com',password:'wrong'})).status,401);
 assert.equal((await post('/login',{email:[],password:'x'})).status,400);
 const response=await post('/login',{email:'test@example.com',password:'test-pass'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.user.name,'Student');assert.equal(result.user.password,undefined);assert.equal((await fetch(protectedUrl,{method:'POST',headers:{Authorization:'Bearer '+result.accessToken}})).status,200);assert.notEqual(result.accessToken,'supabase-private-token');assert.equal(calls,2);
 assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${result.accessToken}`}})).status,200);
 assert.equal((await post('/logout',{},result.accessToken)).status,204);assert.equal((await fetch(protectedUrl,{method:'POST',headers:{Authorization:'Bearer '+result.accessToken}})).status,401);
 assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${result.accessToken}`}})).status,401);
});
