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

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),recoveryCode=String(body.recoveryCode||'').trim().toUpperCase(),newPassword=String(body.newPassword||'');
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)||newPassword.length<8)return json({error:'Ungültige Eingabe.'},400);
    if(passwordBytes(newPassword)>72)return json({error:'Das Passwort darf höchstens 72 Zeichen lang sein (Umlaute und Sonderzeichen zählen mehrfach).'},400);
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    if(!await consume(admin,serviceKey,'recover-ip',clientAddress(req),20,3600))return json({error:'Zu viele Wiederherstellungsversuche. Bitte versuche es später erneut.'},429);
    // Counted per account AND address, so strangers cannot lock the owner out;
    // the daily limit per account still stops slow guessing from many addresses.
    if(!await consume(admin,serviceKey,'recover-user-ip',username+'|'+clientAddress(req),5,900))return json({error:'Zu viele Wiederherstellungsversuche für dieses Konto. Bitte versuche es in 15 Minuten erneut.'},429);
    if(!await consume(admin,serviceKey,'recover-user-day',username,50,86400))return json({error:'Zu viele Wiederherstellungsversuche für dieses Konto. Bitte versuche es morgen erneut.'},429);
    const profile=await admin.from('profiles').select('user_id,recovery_token_hash').eq('username',username).maybeSingle();
    if(!profile.data||profile.data.recovery_token_hash!==await hash(recoveryCode))return json({error:'Benutzername oder Wiederherstellungscode ist falsch.'},403);
    try{if(await isPwnedPassword(newPassword))return json({error:'Dieses Passwort ist aus bekannten Datenlecks bekannt. Bitte verwende ein anderes Passwort.'},400);}catch(error){console.error('recover: leaked-password check unavailable, password accepted unchecked:',error instanceof Error?error.message:String(error));}
    const updated=await admin.auth.admin.updateUserById(profile.data.user_id,{password:newPassword});
    if(updated.error)return json({error:'Passwort konnte nicht geändert werden.'},500);
    // Whoever knew the old password is signed out on every device.
    const revoked=await admin.rpc('revoke_user_sessions',{p_user:profile.data.user_id});
    if(revoked.error)return json({error:'Alte Anmeldungen konnten nicht beendet werden. Bitte erneut versuchen.'},500);
    const nextCode=code();
    const tokenUpdate=await admin.from('profiles').update({recovery_token_hash:await hash(nextCode)}).eq('user_id',profile.data.user_id);
    if(tokenUpdate.error)return json({error:'Neuer Wiederherstellungscode konnte nicht gespeichert werden.'},500);
    return json({recoveryCode:nextCode});
  }catch{return json({error:'Ungültige Anfrage.'},400)}
});
