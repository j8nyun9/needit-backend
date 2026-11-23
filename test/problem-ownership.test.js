const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {ownedProblem,createDeleteProblemHandler}=require('../src/services/problemOwnership');
test('only the verified author sees ownership flags and raw author IDs stay private',()=>{
 const row={id:7,title:'Issue',author_id:'alice',ai_plan:null};
 assert.equal(ownedProblem(row,'alice').can_delete,true);
 assert.equal(ownedProblem(row,'alice').mine,true);
 assert.equal(ownedProblem(row,'bob').can_delete,false);
 assert.equal(ownedProblem(row,null).can_delete,false);
 assert.equal(ownedProblem({...row,author_id:null},'alice').can_delete,false);
 assert.equal(ownedProblem(row,'alice').author_id,undefined);
 assert.equal(row.author_id,'alice');
});
test('delete API checks login, uses verified identity and reports failures without pretending to delete',async t=>{
 let calls=0,fail=false;let exists=true;
 const db={async rpc(name,args){calls++;assert.equal(name,'delete_own_problem');assert.equal(args.p_problem_id,'7');if(fail)return {error:{code:'DB_ERROR'}};if(!exists)return {data:'not_found'};if(args.p_user_id!=='alice')return {data:'forbidden'};exists=false;return {data:'deleted'};}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('x-user'))req.user={id:req.get('x-user')};next();});app.delete('/problems/:id',createDeleteProblemHandler(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/problems`;
 const del=(id,user)=>fetch(base+'/'+id,{method:'DELETE',headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},body:JSON.stringify({author_id:'alice',user_id:'alice'})});
 assert.equal((await del(7)).status,401);assert.equal((await del('bad','alice')).status,400);assert.equal(calls,0);
 assert.equal((await del(7,'bob')).status,403);assert.equal(exists,true);
 fail=true;assert.equal((await del(7,'alice')).status,503);assert.equal(exists,true);fail=false;
 assert.equal((await del(7,'alice')).status,204);assert.equal(exists,false);
 assert.equal((await del(7,'alice')).status,404);
});
test('DB errors include a safe diagnostic code without exposing internal details',async()=>{
 for(const [code,status]of [['PGRST202',503],['42P01',503],['PGRST203',503],['23503',409],['42501',503]]){
  let responseStatus,body;
  const handler=createDeleteProblemHandler({rpc:async()=>({error:{code,message:'private database detail'}})});
  await handler({user:{id:'alice'},params:{id:'7'}},{status(value){responseStatus=value;return this;},json(value){body=value;return this;}});
  assert.equal(responseStatus,status);assert.equal(body.code,code);assert.ok(body.error.includes(code));assert.ok(!body.error.includes('private database detail'));
 }
});
