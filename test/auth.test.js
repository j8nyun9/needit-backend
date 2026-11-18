const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createAuthRouter,hashPassword,checkPassword}=require('../src/routes/auth');
test('salted scrypt hashes accept the right password only',async()=>{const a=await hashPassword('test-password');const b=await hashPassword('test-password');assert.notEqual(a,b);assert.equal(await checkPassword('test-password',a),true);assert.equal(await checkPassword('wrong',a),false);assert.equal(await checkPassword('x','scrypt$broken'),false);});
test('login upgrades legacy password, sessions validate, logout revokes',async t=>{
 const student={id:'student-1',email:'test@example.com',name:'Test',password:'legacy-password'};
 const db={from(table){assert.equal(table,'students');let update=null;const filters={};return {select(){return this;},eq(key,value){filters[key]=value;return this;},update(value){update=value;return this;},async maybeSingle(){return {data:filters.email===student.email?{...student}:null,error:null};},then(resolve,reject){if(update){assert.equal(filters.password,student.password);Object.assign(student,update);}return Promise.resolve({data:[{id:student.id}],error:null}).then(resolve,reject);}}}};
 const app=express();app.use(express.json());app.use('/api/auth',createAuthRouter(db));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/auth`;
 const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 assert.equal((await post('/login',{email:student.email,password:'wrong'})).status,401);
 assert.equal((await post('/login',{email:'missing@example.com',password:'wrong'})).status,401);
 assert.equal((await post('/login',{email:[],password:'x'})).status,400);
 const res=await post('/login',{email:student.email,password:'legacy-password'});assert.equal(res.status,200);const data=await res.json();assert.equal(data.user.name,'Test');assert.equal(data.user.password,undefined);assert.ok(student.password.startsWith('scrypt$'));assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${data.accessToken}`}})).status,200);
 assert.equal((await post('/logout',{},data.accessToken)).status,204);assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${data.accessToken}`}})).status,401);
 assert.equal((await post('/login',{email:student.email,password:'legacy-password'})).status,200);
});
