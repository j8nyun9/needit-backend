function ownedProblem(row,userId){
 const {author_id,...publicFields}=row;
 const mine=Boolean(userId&&author_id&&String(author_id)===String(userId));
 return {...publicFields,mine,can_delete:mine};
}
function createDeleteProblemHandler(db){
 return async(req,res)=>{
  if(!req.user?.id)return res.status(401).json({error:'로그인 후 삭제해주세요.'});
  if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'잘못된 불편함 ID예요.'});
  try{
   // Ownership verification and dependent-row deletion happen in one DB transaction.
   const {data,error}=await db.rpc('delete_own_problem',{p_problem_id:req.params.id,p_user_id:req.user.id});
   if(error){console.error('Problem deletion failed:',error.code||'DB_ERROR');return res.status(503).json({error:'삭제하지 못했어요. 잠시 후 다시 시도해주세요. 동일한 문제가 계속되면 작성자·삭제 기능 DB 설정을 확인해주세요.'});}
   if(data==='not_found')return res.status(404).json({error:'이미 삭제됐거나 찾을 수 없는 불편함이에요.'});
   if(data==='forbidden')return res.status(403).json({error:'본인이 등록한 불편함만 삭제할 수 있어요.'});
   if(data!=='deleted')return res.status(503).json({error:'삭제 결과를 확인하지 못했어요. 다시 불러와 확인해주세요.'});
   return res.sendStatus(204);
  }catch(error){console.error('Problem deletion failed:',error.code||'DB_ERROR');return res.status(503).json({error:'삭제 요청을 처리하지 못했어요. 다시 시도해주세요.'});}
 };
}
module.exports={ownedProblem,createDeleteProblemHandler};
