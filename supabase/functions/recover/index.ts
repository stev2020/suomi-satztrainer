import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>(b%32).toString(32).toUpperCase()).join('').match(/.{1,5}/g)!.join('-');

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),recoveryCode=String(body.recoveryCode||'').trim().toUpperCase(),newPassword=String(body.newPassword||'');
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)||newPassword.length<8||newPassword.length>200)return json({error:'Ungültige Eingabe.'},400);
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}});
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
