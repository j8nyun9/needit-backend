function createEditCommentHandler(db,maxLength=500){
 return async(req,res)=>{
  if(!req.user?.id)return res.status(401).json({error:'로그인 후 댓글을 수정해주세요.'});
  const {id,commentId}=req.params;const {content}=req.body||{};
  if(!/^[1-9]\d*$/.test(id)||!/^[1-9]\d*$/.test(commentId))return res.status(400).json({error:'잘못된 댓글 ID예요.'});
  if(typeof content!=='string'||!content.trim()||content.trim().length>maxLength)return res.status(400).json({error:'댓글은 1~'+maxLength+'자로 입력해주세요.'});
  try{
   const query=()=>db.from('comments').select('id,author_id').eq('id',Number(commentId)).eq('problem_id',Number(id)).maybeSingle();
   const {data:existing,error:findError}=await query();if(findError)throw findError;
   if(!existing)return res.status(404).json({error:'댓글을 찾을 수 없어요.'});
   if(!existing.author_id||String(existing.author_id)!==String(req.user.id))return res.status(403).json({error:'본인이 작성한 댓글만 수정할 수 있어요.'});
   const {data,error}=await db.from('comments').update({content:content.trim()}).eq('id',Number(commentId)).eq('problem_id',Number(id)).eq('author_id',req.user.id).select('id,content,author_name,created_at,author_id').maybeSingle();
   if(error)throw error;if(!data)return res.status(404).json({error:'댓글을 찾을 수 없어요.'});
   const {author_id,...comment}=data;res.json({...comment,can_edit:true,can_delete:true});
  }catch(e){console.error('Comment edit:',e.code||'DB_ERROR');res.status(503).json({error:'댓글을 수정하지 못했어요. 잠시 후 다시 시도해주세요.'});}
 };
}
module.exports={createEditCommentHandler};
