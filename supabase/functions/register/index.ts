import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>(b%32).toString(32).toUpperCase()).join('').match(/.{1,5}/g)!.join('-');
const hex=(value:string)=>Array.from(new TextEncoder().encode(value)).map(b=>b.toString(16).padStart(2,'0')).join('');

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return json({error:'Ungültiger Benutzername.'},400);
    if(password.length<8||password.length>200)return json({error:'Das Passwort muss 8–200 Zeichen lang sein.'},400);
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}});
    const existing=await admin.from('profiles').select('user_id').eq('username',username).maybeSingle();
    if(existing.data)return json({error:'Dieser Benutzername ist bereits vergeben.'},409);
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
