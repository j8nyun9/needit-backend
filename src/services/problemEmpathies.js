// Read the persisted votes rather than relying on an optional likes_count trigger.
async function empathySummary(db, problemIds, userId) {
 const summary=new Map(problemIds.map(id=>[String(id),{count:0,liked:false}]));
 if(!problemIds.length)return summary;
 const pageSize=1000;
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await db.from('empathies').select('problem_id,voter_id')
   .in('problem_id',problemIds).order('problem_id').order('voter_id').range(offset,offset+pageSize-1);
  if(error)throw error;
  for(const row of data||[]){
   const entry=summary.get(String(row.problem_id));
   if(entry){entry.count++;if(userId&&String(row.voter_id)===String(userId))entry.liked=true;}
  }
  if(!data||data.length<pageSize)return summary;
 }
}
async function persistedLikesCount(db, problemId){
 const {count,error}=await db.from('empathies').select('*',{count:'exact',head:true}).eq('problem_id',problemId);
 if(error)throw error;
 return count??0;
}
module.exports={empathySummary,persistedLikesCount};
