import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {sweepOrphanedStreamFiles} from '../_shared/storage-sweep.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
 try{
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.toLowerCase().startsWith('bearer '))return json({error:'Bitte zuerst anmelden.'},401);
  const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||''),decisions=body.decisions;
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)||password.length<8||password.length>200||!Array.isArray(decisions))return json({error:'Ungültige Eingabe.'},400);

  const url=Deno.env.get('SUPABASE_URL')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData.user;
  if(userError||!user?.id||!user.email)return json({error:'Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.'},401);
  const {data:manifest,error:manifestError}=await userClient.rpc('account_deletion_manifest');
  if(manifestError||!manifest)return json({error:'Die Kontodaten konnten nicht geladen werden.'},500);
  if(String(manifest.username||'')!==username)return json({error:'Der eingegebene Benutzername stimmt nicht mit diesem Konto überein.'},400);

  const verifier=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:verified,error:passwordError}=await verifier.auth.signInWithPassword({email:user.email,password});
  if(passwordError||verified.user?.id!==user.id)return json({error:'Das Passwort ist falsch.'},403);

  const {data:plan,error:planError}=await userClient.rpc('account_prepare_deletion',{decisions});
  // Only messages raised on purpose by the database function (P0001) are meant
  // for the user; anything else stays in the log.
  if(planError||!plan){
   if(planError&&planError.code!=='P0001')console.error('delete-account: prepare failed:',planError.code,planError.message);
   return json({error:planError?.code==='P0001'&&planError.message?planError.message:'Die Klassenraum-Auswahl ist ungültig.'},400);
  }
  const cancel=async()=>{try{await userClient.rpc('account_cancel_deletion');}catch{}};
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const objects=Array.isArray(plan.storage_objects)?plan.storage_objects.filter((item:unknown)=>typeof item==='string'):[];
  // The account goes first: if that fails, nothing has been removed yet. Files
  // that cannot be removed afterwards have lost their database row and are
  // collected by the storage sweep (below, and again whenever a room or account is deleted).
  const {error:deleteError}=await admin.auth.admin.deleteUser(user.id,false);
  if(deleteError){console.error('delete-account: deleteUser failed:',deleteError.message);await cancel();return json({error:'Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.'},500);}
  for(let offset=0;offset<objects.length;offset+=100){
   const {error}=await admin.storage.from('classroom-stream').remove(objects.slice(offset,offset+100));
   if(error)console.error('delete-account: file removal left to the storage sweep:',error.message);
  }
  // Rooms deleted together with the account leave files of other members behind.
  try{await sweepOrphanedStreamFiles(admin);}catch(error){console.error('delete-account: storage sweep failed:',error instanceof Error?error.message:String(error));}
  return json({deleted:true});
 }catch{return json({error:'Die Kontolöschung konnte nicht abgeschlossen werden.'},400);}
});
