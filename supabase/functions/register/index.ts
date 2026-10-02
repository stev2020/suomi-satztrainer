import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {isPwnedPassword} from '../_shared/pwned-password.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const hmac=async(secret:string,value:string)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');};
// cf-connecting-ip is set by Cloudflare in front of Supabase and cannot be
// chosen by the client; the first X-Forwarded-For entry can, so it is only a fallback.
const clientAddress=(req:Request)=>String(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,200);
const consume=async(admin:any,secret:string,action:string,subject:string,limit:number,windowSeconds:number)=>{const {data,error}=await admin.rpc('consume_abuse_limit',{p_action:action,p_subject_hash:await hmac(secret,subject),p_limit:limit,p_window_seconds:windowSeconds});if(error)throw error;return data===true;};
// bcrypt only uses the first 72 bytes of a password; longer ones would be cut off silently.
const passwordBytes=(value:string)=>encoder.encode(value).length;
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>(b%32).toString(32).toUpperCase()).join('').match(/.{1,5}/g)!.join('-');
// Cloudflare Turnstile: required as soon as the secret TURNSTILE_SECRET_KEY is set.
const verifyTurnstile=async(secret:string,token:string,ip:string)=>{
  const form=new URLSearchParams({secret,response:token});
  if(ip&&ip!=='unknown')form.set('remoteip',ip);
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Turnstile unavailable');
  const result=await response.json();
  return result.success===true&&(!result.action||result.action==='register');
};
const hex=(value:string)=>Array.from(new TextEncoder().encode(value)).map(b=>b.toString(16).padStart(2,'0')).join('');

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return json({error:'Ungültiger Benutzername.'},400);
    if(password.length<8||passwordBytes(password)>72)return json({error:'Das Passwort muss 8–72 Zeichen lang sein (Umlaute und Sonderzeichen zählen mehrfach).'},400);
    const turnstileSecret=Deno.env.get('TURNSTILE_SECRET_KEY');
    if(turnstileSecret){
      const token=String(body.turnstileToken||'');
      if(!token||token.length>2048)return json({error:'Bitte warte kurz, bis die Sicherheitsprüfung abgeschlossen ist.'},400);
      let human=false;
      try{human=await verifyTurnstile(turnstileSecret,token,clientAddress(req));}
      catch{return json({error:'Die Sicherheitsprüfung ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.'},503);}
      if(!human)return json({error:'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut.'},400);
    }
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    if(!await consume(admin,serviceKey,'register-ip',clientAddress(req),10,3600))return json({error:'Zu viele Registrierungen. Bitte versuche es später erneut.'},429);
    if(!await consume(admin,serviceKey,'register-user',username,3,3600))return json({error:'Zu viele Registrierungsversuche für diesen Benutzernamen. Bitte versuche es später erneut.'},429);
    const existing=await admin.from('profiles').select('user_id').eq('username',username).maybeSingle();
    if(existing.data)return json({error:'Dieser Benutzername ist bereits vergeben.'},409);
    try{if(await isPwnedPassword(password))return json({error:'Dieses Passwort ist aus bekannten Datenlecks bekannt. Bitte verwende ein anderes Passwort.'},400);}catch(error){console.error('register: leaked-password check unavailable, password accepted unchecked:',error instanceof Error?error.message:String(error));}
    const created=await admin.auth.admin.createUser({email:`u${hex(username)}@users.suomi.invalid`,password,email_confirm:true,user_metadata:{username}});
    if(created.error||!created.data.user)return json({error:'Konto konnte nicht erstellt werden.'},400);
    const recoveryCode=code();
    const profile=await admin.from('profiles').insert({user_id:created.data.user.id,username,recovery_token_hash:await hash(recoveryCode)});
    if(profile.error){
      await admin.auth.admin.deleteUser(created.data.user.id);
      if(profile.error.code==='23505')return json({error:'Dieser Benutzername ist bereits vergeben.'},409);
      return json({error:'Profil konnte nicht angelegt werden.'},500);
    }
    return json({recoveryCode},201);
  }catch{return json({error:'Ungültige Anfrage.'},400)}
});
