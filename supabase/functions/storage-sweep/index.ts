import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {sweepOrphanedStreamFiles} from '../_shared/storage-sweep.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hmac=async(secret:string,value:string)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');};

// Called by the app after a classroom was deleted. It only ever removes files
// that no longer belong to any attachment row, so any signed-in user may
// trigger it; a per-account limit keeps it cheap.
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const authorization=req.headers.get('authorization')||'';
    if(!authorization.toLowerCase().startsWith('bearer '))return json({error:'Bitte zuerst anmelden.'},401);
    const url=Deno.env.get('SUPABASE_URL')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user?.id)return json({error:'Bitte zuerst anmelden.'},401);
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:allowed,error:limitError}=await admin.rpc('consume_abuse_limit',{p_action:'storage-sweep-user',p_subject_hash:await hmac(serviceKey,userData.user.id),p_limit:20,p_window_seconds:3600});
    if(limitError)throw limitError;
    if(allowed!==true)return json({error:'Zu viele Anfragen. Bitte später erneut versuchen.'},429);
    return json({removed:await sweepOrphanedStreamFiles(admin)});
  }catch{return json({error:'Aufräumen fehlgeschlagen.'},500)}
});
