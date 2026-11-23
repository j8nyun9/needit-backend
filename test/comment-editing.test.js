const {test}=require('node:test');const assert=require('node:assert/strict');const {createEditCommentHandler}=require('../src/services/commentEditing');
test('comment editing checks author and persists content without changing date',async()=>{
 let row={id:7,problem_id:3,author_id:'alice',author_name:'Student',content:'Before',created_at:'2026-11-20T00:00:00Z'};let writes=0;
 const db={from(){let patch=null,filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},update(data){patch=data;return q;},maybeSingle(){let data=row&&filters.every(f=>f(row))?row:null;if(data&&patch){row={...row,...patch};data=row;writes++;}return Promise.resolve({data,error:null});}};return q;}};
 const handler=createEditCommentHandler(db);async function run(user,body,params={id:'3',commentId:'7'}){const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await handler({user:user?{id:user}:null,body,params},res);return res;}
 assert.equal((await run(null,{content:'Changed'})).statusCode,401);
 assert.equal((await run('bob',{content:'Changed'})).statusCode,403);assert.equal(writes,0);
 assert.equal((await run('alice',{content:' '})).statusCode,400);
 assert.equal((await run('alice',{content:'x'.repeat(501)})).statusCode,400);
 assert.equal((await run('alice',{content:'Changed'},{id:'4',commentId:'7'})).statusCode,404);
 const saved=await run('alice',{content:'  Changed  '});assert.equal(saved.statusCode,200);assert.equal(saved.body.content,'Changed');assert.equal(saved.body.created_at,'2026-11-20T00:00:00Z');assert.equal(saved.body.author_id,undefined);assert.equal(saved.body.can_edit,true);assert.equal(writes,1);
 assert.equal((await run('alice',{content:'Changed'},{id:'x',commentId:'7'})).statusCode,400);
});
