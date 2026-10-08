// Passwort im angemeldeten Konto ändern: aktuelles Passwort prüfen, neues gegen bekannte Datenlecks prüfen,
// setzen und alle Anmeldungen beenden (der Browser meldet sich danach mit dem neuen Passwort neu an).
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {isPwnedPassword} from '../_shared/pwned-password.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hmac=async(secret:string,value:string)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');};
const consume=async(admin:any,secret:string,action:string,subject:string,limit:number,windowSeconds:number)=>{const {data,error}=await admin.rpc('consume_abuse_limit',{p_action:action,p_subject_hash:await hmac(secret,subject),p_limit:limit,p_window_seconds:windowSeconds});if(error)throw error;return data===true;};

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const authorization=req.headers.get('authorization')||'';
    if(!authorization.toLowerCase().startsWith('bearer '))return json({error:'Bitte zuerst anmelden.'},401);
    const body=await req.json(),currentPassword=String(body.currentPassword||''),newPassword=String(body.newPassword||'');
    if(newPassword.length<8||encoder.encode(newPassword).length>72)return json({error:'Das Passwort muss 8–72 Zeichen lang sein (Umlaute und Sonderzeichen zählen mehrfach).'},400);
    if(newPassword===currentPassword)return json({error:'Das neue Passwort muss sich vom aktuellen unterscheiden.'},400);

    const url=Deno.env.get('SUPABASE_URL')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(authorization.slice(7).trim());
    const user=userData?.user;
    if(userError||!user?.id||!user.email)return json({error:'Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.'},401);
    if(!await consume(admin,serviceKey,'password-change-user',user.id,10,3600))return json({error:'Zu viele Versuche. Bitte versuche es später erneut.'},429);

    const verifier=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:verified,error:passwordError}=currentPassword.length>=8&&currentPassword.length<=200
      ?await verifier.auth.signInWithPassword({email:user.email,password:currentPassword})
      :{data:{user:null},error:new Error('invalid')};
    if(passwordError||verified.user?.id!==user.id)return json({error:'Das aktuelle Passwort ist falsch.'},403);

    try{if(await isPwnedPassword(newPassword))return json({error:'Dieses Passwort ist aus bekannten Datenlecks bekannt. Bitte verwende ein anderes Passwort.'},400);}catch(error){console.error('change-password: leaked-password check unavailable, password accepted unchecked:',error instanceof Error?error.message:String(error));}
    const updated=await admin.auth.admin.updateUserById(user.id,{password:newPassword});
    if(updated.error)return json({error:'Das Passwort konnte nicht geändert werden.'},500);
    // Wer das alte Passwort kannte, wird auf allen Geräten abgemeldet.
    const revoked=await admin.rpc('revoke_user_sessions',{p_user:user.id});
    if(revoked.error)console.error('change-password: sessions not revoked:',revoked.error.message);
    return json({ok:true});
  }catch(error){
    console.error('change-password:',error instanceof Error?error.message:String(error));
    return json({error:'Ungültige Anfrage.'},400);
  }
});
