import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const hmac=async(secret:string,value:string)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');};
const clientAddress=(req:Request)=>String(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim().slice(0,200);
const consume=async(admin:any,secret:string,action:string,subject:string,limit:number,windowSeconds:number)=>{const {data,error}=await admin.rpc('consume_abuse_limit',{p_action:action,p_subject_hash:await hmac(secret,subject),p_limit:limit,p_window_seconds:windowSeconds});if(error)throw error;return data===true;};
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>(b%32).toString(32).toUpperCase()).join('').match(/.{1,5}/g)!.join('-');

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),recoveryCode=String(body.recoveryCode||'').trim().toUpperCase(),newPassword=String(body.newPassword||'');
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)||newPassword.length<8||newPassword.length>200)return json({error:'Ungültige Eingabe.'},400);
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    if(!await consume(admin,serviceKey,'recover-ip',clientAddress(req),20,3600))return json({error:'Zu viele Wiederherstellungsversuche. Bitte versuche es später erneut.'},429);
    if(!await consume(admin,serviceKey,'recover-user',username,5,900))return json({error:'Zu viele Wiederherstellungsversuche für dieses Konto. Bitte versuche es in 15 Minuten erneut.'},429);
    const profile=await admin.from('profiles').select('user_id,recovery_token_hash').eq('username',username).maybeSingle();
    if(!profile.data||profile.data.recovery_token_hash!==await hash(recoveryCode))return json({error:'Benutzername oder Wiederherstellungscode ist falsch.'},403);
    const updated=await admin.auth.admin.updateUserById(profile.data.user_id,{password:newPassword});
    if(updated.error)return json({error:'Passwort konnte nicht geändert werden.'},500);
    const nextCode=code();
    const tokenUpdate=await admin.from('profiles').update({recovery_token_hash:await hash(nextCode)}).eq('user_id',profile.data.user_id);
    if(tokenUpdate.error)return json({error:'Neuer Wiederherstellungscode konnte nicht gespeichert werden.'},500);
    return json({recoveryCode:nextCode});
  }catch{return json({error:'Ungültige Anfrage.'},400)}
});
