const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
function equal(a,b){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `scrypt$${salt}$${key.toString('hex')}`;}
async function checkPassword(password,stored){if(typeof stored!=='string')return false;if(stored.startsWith('scrypt$')){const parts=stored.split('$');if(parts.length!==3||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;const key=await scrypt(password,parts[1],64);return equal(key.toString('hex'),parts[2]);}if(/^\$(2[aby]|argon2)/.test(stored))return false;return equal(crypto.createHash('sha256').update(password).digest('hex'),crypto.createHash('sha256').update(stored).digest('hex'));}
function createAuthRouter(db){
 const router=require('express').Router();const sessions=new Map();const attempts=new Map();const ttl=8*60*60*1000;
 const publicUser=u=>({id:u.id,name:u.name,email:u.email});
 function token(req){return /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization')||'')?.[1];}
 function cleanup(){const now=Date.now();for(const[k,v]of sessions)if(v.expiresAt<=now)sessions.delete(k);for(const[k,v]of attempts)if(v.until<=now)attempts.delete(k);}
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.post('/login',async(req,res)=>{
  cleanup();const key=req.ip;const now=Date.now();const limit=attempts.get(key);
  if(limit?.count>=10)return res.status(429).json({error:'로그인 시도가 너무 많아요. 15분 후 다시 시도해주세요.'});
  if(!limit&&attempts.size>=10000)return res.status(503).json({error:'잠시 후 다시 시도해주세요.'});
  attempts.set(key,{count:(limit?.count||0)+1,until:limit?.until||now+15*60*1000});
  const {email,password}=req.body||{};
  if(typeof email!=='string'||typeof password!=='string'||!email.trim()||email.length>254||!password||password.length>128)return res.status(400).json({error:'이메일과 비밀번호를 입력해주세요.'});
  try{
   const {data:user,error}=await db.from('students').select('id,name,email,password').eq('email',email.trim()).maybeSingle();
   if(error)throw error;
   if(!user||!await checkPassword(password,user.password))return res.status(401).json({error:'이메일 또는 비밀번호가 일치하지 않아요.'});
   if(user.id==null)throw new Error('Student ID missing');
   // Upgrade the existing demo plaintext password before issuing a session.
   if(!user.password.startsWith('scrypt$')){
    const hash=await hashPassword(password);
    const updated=await db.from('students').update({password:hash}).eq('id',user.id).eq('password',user.password).select('id');
    if(updated.error||!updated.data?.length)throw new Error('Password migration failed');
   }
   if(sessions.size>=10000)return res.status(503).json({error:'접속자가 많아요. 잠시 후 다시 시도해주세요.'});
   const accessToken=crypto.randomBytes(32).toString('hex');const expiresAt=Date.now()+ttl;
   sessions.set(accessToken,{user:publicUser(user),expiresAt});attempts.delete(key);
   return res.json({user:publicUser(user),accessToken,expiresAt});
  }catch(error){console.error('Login failed:',error.code||'AUTH_DB_ERROR');return res.status(503).json({error:'로그인 처리에 실패했어요. 백엔드의 students 테이블과 DB 연결 설정을 확인해주세요.'});}
 });
 router.get('/me',(req,res)=>{cleanup();const session=sessions.get(token(req));if(!session)return res.status(401).json({error:'다시 로그인해주세요.'});res.json({user:session.user,expiresAt:session.expiresAt});});
 router.post('/logout',(req,res)=>{sessions.delete(token(req));res.sendStatus(204);});
 return router;
}
module.exports={createAuthRouter,hashPassword,checkPassword};
