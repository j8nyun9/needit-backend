function ownedProblem(row,userId){
 const {author_id,...publicFields}=row;
 const mine=Boolean(userId&&author_id&&String(author_id)===String(userId));
 return {...publicFields,mine,can_edit:mine,can_delete:mine};
}
function createDeleteProblemHandler(db){
 function dbFailure(res,error){
  const code=typeof error?.code==='string'?error.code:'DB_ERROR';
  console.error('Problem deletion failed:',{code,message:error?.message,hint:error?.hint});
  const messages={
   PGRST202:'삭제 기능의 DB 함수가 준비되지 않았어요. 삭제 기능 SQL을 적용해주세요.',
   '42883':'삭제 기능의 DB 함수를 확인해주세요.',
   PGRST203:'삭제 함수가 중복 등록되어 있어요. 삭제 함수 복구 SQL을 적용해주세요.',
   '42P01':'삭제 함수가 없는 테이블을 참조하고 있어요. 삭제 함수 복구 SQL을 적용해주세요.',
   '42703':'삭제 함수와 DB의 항목 구성이 달라요. 서버 로그를 확인해주세요.',
   '42501':'서버에 삭제 권한이 없어요. DB 함수와 서버 권한을 확인해주세요.',
   '23503':'연결된 데이터 때문에 삭제할 수 없어요. 서버 로그를 확인해주세요.',
  };
  return res.status(code==='23503'?409:503).json({error:(messages[code]||'삭제하지 못했어요. 잠시 후 다시 시도해주세요.')+' (오류 코드: '+code+')',code});
 }
 return async(req,res)=>{
  if(!req.user?.id)return res.status(401).json({error:'로그인 후 삭제해주세요.'});
  if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'잘못된 불편함 ID예요.'});
  try{
   // Ownership verification and dependent-row deletion happen in one DB transaction.
   const {data,error}=await db.rpc('delete_own_problem',{p_problem_id:req.params.id,p_user_id:req.user.id});
   if(error)return dbFailure(res,error);
   if(data==='not_found')return res.status(404).json({error:'이미 삭제됐거나 찾을 수 없는 불편함이에요.'});
   if(data==='forbidden')return res.status(403).json({error:'본인이 등록한 불편함만 삭제할 수 있어요.'});
   if(data!=='deleted')return res.status(503).json({error:'삭제 결과를 확인하지 못했어요. 다시 불러와 확인해주세요.'});
   return res.sendStatus(204);
  }catch(error){return dbFailure(res,error);}
 };
}
module.exports={ownedProblem,createDeleteProblemHandler};
