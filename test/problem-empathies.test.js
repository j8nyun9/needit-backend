const {test}=require('node:test');const assert=require('node:assert/strict');
const {empathySummary,persistedLikesCount}=require('../src/services/problemEmpathies');
function dbFor(votes){return {from(table){assert.equal(table,'empathies');let ids,problemId,head=false;return {select(fields,options){head=options?.head;return this;},in(key,values){ids=values.map(String);return this;},order(){return this;},eq(key,id){problemId=id;return Promise.resolve({count:votes.filter(v=>String(v.problem_id)===String(id)).length,error:null});},range(start,end){return Promise.resolve({data:votes.filter(v=>ids.includes(String(v.problem_id))).slice(start,end+1),error:null});}};}};}
test('votes and per-user state survive re-query without a cached likes_count column',async()=>{
 const votes=[];const db=dbFor(votes);
 assert.deepEqual((await empathySummary(db,[7],'alice')).get('7'),{count:0,liked:false});
 votes.push({problem_id:'7',voter_id:'alice'});
 assert.equal(await persistedLikesCount(db,7),1);
 assert.deepEqual((await empathySummary(db,[7],'alice')).get('7'),{count:1,liked:true});
 assert.deepEqual((await empathySummary(db,['7'],'bob')).get('7'),{count:1,liked:false});
 assert.deepEqual((await empathySummary(db,[7],null)).get('7'),{count:1,liked:false});
 votes.push({problem_id:7,voter_id:'bob'});
 assert.deepEqual((await empathySummary(db,[7],'alice')).get('7'),{count:2,liked:true});
 votes.splice(0,1);
 assert.deepEqual((await empathySummary(db,[7],'alice')).get('7'),{count:1,liked:false});
 assert.equal(await persistedLikesCount(db,7),1);
});
test('counts include votes beyond the first database page',async()=>{
 const votes=Array.from({length:1001},(_,i)=>({problem_id:7,voter_id:'student-'+i}));
 assert.deepEqual((await empathySummary(dbFor(votes),[7],'student-1000')).get('7'),{count:1001,liked:true});
});
test('DB failures surface rather than resetting the saved state to zero',async()=>{
 const db={from(){return {select(){return this;},in(){return this;},order(){return this;},range:async()=>({error:new Error('offline')})};}};
 await assert.rejects(empathySummary(db,[7],'alice'),/offline/);
 assert.equal((await empathySummary({from(){throw Error('unexpected query');}},[],'alice')).size,0);
});
