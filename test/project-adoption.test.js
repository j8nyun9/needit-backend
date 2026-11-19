const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createProjectsRouter,parseAdoption}=require('../src/services/projectRelease');
const {withProjectId}=require('../src/services/problemProjects');

// In-memory stand-in for the create_project_from_problem RPC, mirroring its transactional rules.
function mockDb(){
 const state={problems:[34,35],plans:[['alice',34],['bob',34]],links:[],projects:[],calls:[]};
 return {state,
  rpc(name,args){state.calls.push(name);
   if(!state.problems.includes(args.p_problem_id))return Promise.resolve({data:{status:'not_found'},error:null});
   if(!state.plans.some(([u,p])=>u===args.p_user_id&&p===args.p_problem_id))return Promise.resolve({data:{status:'forbidden'},error:null});
   const linked=state.links.find(l=>l.problem_id===args.p_problem_id);
   if(linked)return Promise.resolve({data:{status:'conflict',project_id:linked.project_id},error:null});
   const project={id:state.projects.length+5,title:args.p_title,description:args.p_description,features:args.p_features,owner_id:args.p_user_id,release_status:'기획 중'};
   state.projects.push(project);state.links.push({project_id:project.id,problem_id:args.p_problem_id});
   return Promise.resolve({data:{status:'created',project},error:null});
  },
  from(){const q={select:()=>q,eq:()=>q,then:(r,j)=>Promise.resolve({data:[],error:null}).then(r,j)};return q;}};
}

test('adoption payload validation',()=>{
 const ok={problem_id:34,title:' 수강계획서 비교 ',description:'설명',features:['과목명 검색']};
 assert.deepEqual(parseAdoption(ok),{problemId:34,title:'수강계획서 비교',description:'설명',features:['과목명 검색']});
 assert.deepEqual(parseAdoption({...ok,features:undefined}).features,[]);
 for(const bad of [{...ok,problem_id:0},{...ok,problem_id:'x'},{...ok,title:'  '},{...ok,title:'a'.repeat(101)},{...ok,description:''},{...ok,description:'a'.repeat(5001)},{...ok,features:'a'},{...ok,features:Array(11).fill('a')},{...ok,features:['a'.repeat(251)]},{...ok,features:['']},{...ok,features:[1]}])
  assert.equal(parseAdoption(bad),null,JSON.stringify(bad).slice(0,80));
});

test('POST /projects status codes and single adoption',async t=>{
 const db=mockDb();const app=express();app.use(express.json());
 app.use((req,res,next)=>{if(req.get('x-user'))req.user={id:req.get('x-user'),name:'Student'};next();});
 app.use('/projects',createProjectsRouter(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const post=(user,body)=>fetch(`http://127.0.0.1:${server.address().port}/projects`,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},body:JSON.stringify(body)});
 const body={problem_id:34,title:'수강계획서 비교 서비스',description:'분반별 비교',features:['과목명 검색']};
 assert.equal((await post(null,body)).status,401);
 assert.equal((await post('alice',{...body,title:''})).status,400);
 assert.equal(db.state.calls.length,0);
 assert.equal((await post('alice',{...body,problem_id:999})).status,404);
 assert.equal((await post('carol',body)).status,403);
 const created=await post('alice',body);assert.equal(created.status,201);
 const project=await created.json();
 assert.equal(project.id,5);assert.equal(project.can_edit,true);assert.equal(project.owner_id,undefined);assert.deepEqual(project.problem_ids,[34]);
 const dup=await post('bob',body);assert.equal(dup.status,409);
 assert.deepEqual(await dup.json(),{error:'이미 다른 프로젝트에 채택된 불편함이에요.'});
 assert.equal(db.state.projects.length,1);
});

test('project_id from either PostgREST embed shape',()=>{
 assert.equal(withProjectId({id:1,project_problems:[{project_id:5}]}).project_id,5);
 assert.equal(withProjectId({id:1,project_problems:{project_id:6}}).project_id,6);
 assert.equal(withProjectId({id:1,project_problems:[]}).project_id,null);
 assert.equal(withProjectId({id:1,project_problems:null}).project_id,null);
 assert.equal('project_problems' in withProjectId({id:1,project_problems:null}).problem,false);
});
