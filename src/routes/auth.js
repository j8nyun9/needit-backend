const crypto = require('node:crypto');
function isolatedAuthClient(){
 const {createClient}=require('@supabase/supabase-js');
 return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function createAuthRouter(db,makeClient=isolatedAuthClient){
 const router=require('express').Router();const sessions=new Map();const attempts=new Map();const ttl=8*60*60*1000;
 const publicUser=u=>({id:u.id,name:u.name,email:u.email});
 function token(req){return /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization')||'')?.[1];}
 function cleanup(){const now=Date.now();for(const[k,v]of sessions)if(v.expiresAt<=now)sessions.delete(k);for(const[k,v]of attempts)if(v.until<=now)attempts.delete(k);}
 router.optionalAuth=(req,res,next)=>{cleanup();req.user=sessions.get(token(req))?.user||null;next();};
 router.requireAuth=(req,res,next)=>{cleanup();const session=sessions.get(token(req));if(!session)return res.status(401).json({error:'로그인 후 사용할 수 있는 기능이에요.'});req.user=session.user;next();};
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.post('/login',async(req,res)=>{
  cleanup();const key=req.ip;const now=Date.now();const limit=attempts.get(key);
  if(limit?.count>=10)return res.status(429).json({error:'로그인 시도가 너무 많아요. 15분 후 다시 시도해주세요.'});
  if(!limit&&attempts.size>=10000)return res.status(503).json({error:'잠시 후 다시 시도해주세요.'});
  attempts.set(key,{count:(limit?.count||0)+1,until:limit?.until||now+15*60*1000});
  const {email,password}=req.body||{};
  if(typeof email!=='string'||typeof password!=='string'||!email.trim()||email.length>254||!password||password.length>128)return res.status(400).json({error:'이메일과 비밀번호를 입력해주세요.'});
  try{
   // Each request gets its own Auth client so concurrent logins cannot replace
   // the shared administrative client's session or database permissions.
   const client=makeClient();
   const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password});
   if(error){
    if(error.status===400||error.status===401)return res.status(401).json({error:'이메일 또는 비밀번호가 일치하지 않아요.'});
    if(error.status===429)return res.status(429).json({error:'로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.'});
    throw error;
   }
   if(!data?.user?.id||!data?.session?.access_token)throw new Error('Invalid Auth response');
   const authUser=data.user;
   const {data:profile,error:profileError}=await db.from('profiles').select('id,name,email').eq('id',authUser.id).maybeSingle();
   if(profileError)console.error('Profile lookup failed:',profileError.code||'PROFILE_ERROR');
   const user={id:authUser.id,email:authUser.email,name:profile?.name||authUser.user_metadata?.name||authUser.email};
   if(sessions.size>=10000)return res.status(503).json({error:'접속자가 많아요. 잠시 후 다시 시도해주세요.'});
   const accessToken=crypto.randomBytes(32).toString('hex');const expiresAt=Math.min(Date.now()+ttl,data.session.expires_at?data.session.expires_at*1000:Date.now()+ttl);
   sessions.set(accessToken,{user:publicUser(user),expiresAt});attempts.delete(key);
   return res.json({user:publicUser(user),accessToken,expiresAt});
  }catch(error){console.error('Login failed:',error.code||'AUTH_DB_ERROR');return res.status(503).json({error:'로그인 처리에 실패했어요. 백엔드의 Supabase Auth 연결 설정을 확인해주세요.'});}
 });
 router.get('/me',(req,res)=>{cleanup();const session=sessions.get(token(req));if(!session)return res.status(401).json({error:'다시 로그인해주세요.'});res.json({user:session.user,expiresAt:session.expiresAt});});
 router.post('/logout',(req,res)=>{sessions.delete(token(req));res.sendStatus(204);});
 return router;
}
module.exports={createAuthRouter};
