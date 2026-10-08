// Freiwillige E-Mail-Adresse zum Zurücksetzen des Passworts.
//
// Aktionen (POST, JSON {action, …}):
//   angemeldet:  status · set {email, adult, lang} · remove
//   ohne Konto:  verify {token} · reset-request {identifier, lang} · reset-confirm {token, newPassword}
//
// Die Adresse gilt erst nach Bestätigung über einen Link. Links sind zufällige Einmal-Tokens; gespeichert wird nur
// ihr SHA-256-Hash. „reset-request“ antwortet immer gleich, damit niemand herausfindet, ob es ein Konto oder eine
// Adresse gibt. Versand über Lettermint (EU); der Anbieter steht nur in sendMail().
// Secrets: LETTERMINT_API_TOKEN (Pflicht), MAIL_FROM (optional), SITE_URL (optional).
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {isPwnedPassword} from '../_shared/pwned-password.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
const hash=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const hmac=async(secret:string,value:string)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));};
const clientAddress=(req:Request)=>String(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,200);
const consume=async(admin:any,secret:string,action:string,subject:string,limit:number,windowSeconds:number)=>{const {data,error}=await admin.rpc('consume_abuse_limit',{p_action:action,p_subject_hash:await hmac(secret,subject),p_limit:limit,p_window_seconds:windowSeconds});if(error)throw error;return data===true;};
const newToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const validToken=(value:string)=>/^[A-Za-z0-9_-]{40,50}$/.test(value);
const normalizeEmail=(value:unknown)=>String(value??'').trim().toLowerCase();
const validEmail=(value:string)=>value.length>=6&&value.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

const VERIFY_HOURS=48,RESET_MINUTES=60;
// Links zeigen auf die Seite, von der die Anfrage kam – aber nur, wenn sie zu Vanamo gehört.
const SITE=(Deno.env.get('SITE_URL')||'https://vanamo.app').replace(/\/+$/,'');
const ORIGINS=new Set([SITE,'https://vanamo.app','http://localhost:4173','http://127.0.0.1:4173']);
const siteFor=(req:Request)=>{const origin=String(req.headers.get('origin')||'').replace(/\/+$/,'');return ORIGINS.has(origin)?origin:SITE;};

type Mail={to:string,subject:string,text:string,html:string};
async function sendMail(mail:Mail){
  const token=Deno.env.get('LETTERMINT_API_TOKEN');
  if(!token)throw new Error('mail not configured');
  const response=await fetch('https://api.lettermint.co/v1/send',{method:'POST',signal:AbortSignal.timeout(8000),
    headers:{'Content-Type':'application/json',Accept:'application/json','x-lettermint-token':token},
    body:JSON.stringify({from:Deno.env.get('MAIL_FROM')||'Vanamo <noreply@vanamo.app>',to:[mail.to],subject:mail.subject,text:mail.text,html:mail.html})});
  if(!response.ok)throw new Error(`mail provider ${response.status}: ${(await response.text().catch(()=>'')).slice(0,300)}`);
}
// Schlichte Mail: Text und dieselbe Aussage als HTML mit einem Knopf. Kein Tracking, keine Bilder.
function compose(to:string,subject:string,paragraphs:string[],link:string,button:string,footer:string[]):Mail{
  const text=[...paragraphs,link,...footer,'Vanamo · https://vanamo.app · Impressum: https://vanamo.app/impressum.html'].join('\n\n');
  const p=(value:string,style='')=>`<p style="margin:0 0 16px;${style}">${escapeHTML(value)}</p>`;
  const html=`<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f0;color:#172c38;font:16px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><div style="max-width:480px;margin:0 auto">${paragraphs.map(x=>p(x)).join('')}<p style="margin:24px 0"><a href="${escapeHTML(link)}" style="display:inline-block;padding:12px 22px;border:2px solid #172c38;border-radius:12px;background:#fffdf8;color:#172c38;font-weight:600;text-decoration:none">${escapeHTML(button)}</a></p>${p(link,'font-size:13px;color:#52616a;word-break:break-all')}${footer.map(x=>p(x,'font-size:14px;color:#52616a')).join('')}<p style="margin:24px 0 0;font-size:12px;color:#52616a">Vanamo · <a href="https://vanamo.app" style="color:#52616a">vanamo.app</a> · <a href="https://vanamo.app/impressum.html" style="color:#52616a">Impressum</a></p></div></body></html>`;
  return {to,subject,text,html};
}
const verifyMail=(lang:string,to:string,username:string,link:string)=>lang==='en'
  ?compose(to,'Confirm your email address for Vanamo',[`Hello ${username},`,'you added this address to your Vanamo account so you can reset a forgotten password. Please confirm it:'],link,'Confirm email address',[`The link is valid for ${VERIFY_HOURS} hours. If this wasn't you, you can ignore this email – without confirmation the address is not used.`])
  :compose(to,'Bestätige deine E-Mail-Adresse für Vanamo',[`Hallo ${username},`,'du hast diese Adresse in deinem Vanamo-Konto hinterlegt, damit du ein vergessenes Passwort zurücksetzen kannst. Bitte bestätige sie:'],link,'E-Mail-Adresse bestätigen',[`Der Link gilt ${VERIFY_HOURS} Stunden. Wenn du das nicht warst, kannst du diese Mail ignorieren – ohne Bestätigung wird die Adresse nicht verwendet.`]);
const resetMail=(lang:string,to:string,username:string,link:string)=>lang==='en'
  ?compose(to,'New password for Vanamo',['Hello,',`a new password was requested for the Vanamo account “${username}”. Choose a new password here:`],link,'Choose new password',[`The link is valid for ${RESET_MINUTES} minutes and works once. If this wasn't you, ignore this email – your password stays unchanged.`])
  :compose(to,'Neues Passwort für Vanamo',['Hallo,',`für das Vanamo-Konto „${username}“ wurde ein neues Passwort angefordert. Hier kannst du es festlegen:`],link,'Neues Passwort festlegen',[`Der Link gilt ${RESET_MINUTES} Minuten und funktioniert einmal. Wenn du das nicht warst, ignoriere diese Mail – dein Passwort bleibt unverändert.`]);

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await req.json(),action=String(body.action||''),lang=body.lang==='en'?'en':'de';
    const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const ip=clientAddress(req),configured=!!Deno.env.get('LETTERMINT_API_TOKEN');
    // Höchstens so viele Mails am Tag insgesamt – schützt das Kontingent beim Anbieter vor Missbrauch.
    const mailBudget=()=>consume(admin,serviceKey,'mail-global','all',60,86400);

    if(action==='status'||action==='set'||action==='remove'){
      const authorization=req.headers.get('authorization')||'';
      if(!authorization.toLowerCase().startsWith('bearer '))return json({error:'Bitte zuerst anmelden.'},401);
      const {data:userData,error:userError}=await admin.auth.getUser(authorization.slice(7).trim());
      const user=userData?.user;
      if(userError||!user?.id)return json({error:'Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.'},401);
      const profile=await admin.from('profiles').select('username').eq('user_id',user.id).maybeSingle();
      if(!profile.data)return json({error:'Bitte zuerst anmelden.'},401);
      const current=await admin.from('account_emails').select('email,verified_at').eq('user_id',user.id).maybeSingle();
      if(current.error)throw current.error;
      const view=(row:any)=>({email:row?.email||'',verified:!!row?.verified_at,configured});

      if(action==='status')return json(view(current.data));
      if(action==='remove'){
        const removed=await admin.from('account_emails').delete().eq('user_id',user.id);
        if(removed.error)throw removed.error;
        return json(view(null));
      }
      const email=normalizeEmail(body.email);
      if(!validEmail(email))return json({error:'Bitte gib eine gültige E-Mail-Adresse ein.'},400);
      if(body.adult!==true)return json({error:'Eine E-Mail-Adresse kannst du erst ab 16 Jahren hinterlegen.'},400);
      if(current.data?.email===email&&current.data.verified_at)return json(view(current.data));
      if(!configured)return json({error:'Der E-Mail-Versand ist noch nicht eingerichtet.'},503);
      if(!await consume(admin,serviceKey,'email-set-user',user.id,5,86400))return json({error:'Zu viele Versuche. Bitte versuche es morgen erneut.'},429);
      if(!await consume(admin,serviceKey,'email-set-address',email,3,86400))return json({error:'An diese Adresse wurden heute schon mehrere Mails geschickt. Bitte versuche es morgen erneut.'},429);
      if(!await mailBudget())return json({error:'Heute können keine weiteren Mails verschickt werden. Bitte versuche es morgen erneut.'},429);
      const token=newToken();
      const saved=await admin.from('account_emails').upsert({user_id:user.id,email,adult_confirmed_at:new Date().toISOString(),verified_at:null,
        verify_token_hash:await hash(token),verify_expires_at:new Date(Date.now()+VERIFY_HOURS*3600e3).toISOString(),reset_token_hash:null,reset_expires_at:null});
      if(saved.error)throw saved.error;
      try{await sendMail(verifyMail(lang,email,profile.data.username,`${siteFor(req)}/?verify-email=${token}`));}
      catch(error){console.error('account-email: verification mail failed:',error instanceof Error?error.message:String(error));return json({error:'Die Bestätigungsmail konnte nicht verschickt werden. Bitte versuche es später erneut.',email,verified:false,configured},502);}
      return json({email,verified:false,configured});
    }

    if(action==='verify'){
      const token=String(body.token||'');
      if(!await consume(admin,serviceKey,'email-verify-ip',ip,30,3600))return json({error:'Zu viele Versuche. Bitte versuche es später erneut.'},429);
      if(!validToken(token))return json({error:'Der Link ist ungültig oder abgelaufen.'},400);
      const updated=await admin.from('account_emails').update({verified_at:new Date().toISOString(),verify_token_hash:null,verify_expires_at:null})
        .eq('verify_token_hash',await hash(token)).gt('verify_expires_at',new Date().toISOString()).select('user_id');
      if(updated.error)throw updated.error;
      if(!updated.data?.length)return json({error:'Der Link ist ungültig oder abgelaufen.'},400);
      return json({ok:true});
    }

    if(action==='reset-request'){
      const identifier=String(body.identifier||'').trim().toLowerCase();
      if(identifier.length<3||identifier.length>254)return json({error:'Bitte gib deinen Benutzernamen oder deine E-Mail-Adresse ein.'},400);
      if(!configured)return json({error:'Der E-Mail-Versand ist noch nicht eingerichtet.'},503);
      if(!await consume(admin,serviceKey,'reset-request-ip',ip,10,3600))return json({error:'Zu viele Anfragen. Bitte versuche es später erneut.'},429);
      // Gezählt wird die Eingabe selbst, noch bevor nach einem Konto gesucht wird – die Meldung verrät also nicht, ob es eines gibt.
      if(!await consume(admin,serviceKey,'reset-request-id',identifier,5,3600))return json({error:'Dafür wurden gerade schon mehrere Links angefordert. Nimm den neuesten aus deinem Postfach oder versuche es in einer Stunde erneut.'},429);
      // Ab hier immer dieselbe Antwort – auch wenn es das Konto nicht gibt oder keine Adresse hinterlegt ist.
      const done=json({ok:true});
      let rows:any[]=[];
      if(identifier.includes('@')){
        if(!validEmail(identifier))return done;
        const found=await admin.from('account_emails').select('user_id,email').eq('email',identifier).not('verified_at','is',null).limit(5);
        if(found.error)throw found.error;
        rows=found.data||[];
      }else{
        if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(identifier))return done;
        const profile=await admin.from('profiles').select('user_id').eq('username',identifier).maybeSingle();
        if(!profile.data)return done;
        const found=await admin.from('account_emails').select('user_id,email').eq('user_id',profile.data.user_id).not('verified_at','is',null).maybeSingle();
        if(found.error)throw found.error;
        if(found.data)rows=[found.data];
      }
      for(const row of rows){
        const profile=await admin.from('profiles').select('username').eq('user_id',row.user_id).maybeSingle();
        if(!profile.data||!await mailBudget())continue;
        const token=newToken();
        const saved=await admin.from('account_emails').update({reset_token_hash:await hash(token),reset_expires_at:new Date(Date.now()+RESET_MINUTES*60e3).toISOString()}).eq('user_id',row.user_id);
        if(saved.error){console.error('account-email: reset token not saved:',saved.error.message);continue;}
        try{await sendMail(resetMail(lang,row.email,profile.data.username,`${siteFor(req)}/?reset=${token}`));}
        catch(error){console.error('account-email: reset mail failed:',error instanceof Error?error.message:String(error));}
      }
      return done;
    }

    if(action==='reset-confirm'){
      const token=String(body.token||''),newPassword=String(body.newPassword||'');
      if(!await consume(admin,serviceKey,'reset-confirm-ip',ip,20,3600))return json({error:'Zu viele Versuche. Bitte versuche es später erneut.'},429);
      if(!validToken(token))return json({error:'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'},400);
      if(newPassword.length<8||encoder.encode(newPassword).length>72)return json({error:'Das Passwort muss 8–72 Zeichen lang sein (Umlaute und Sonderzeichen zählen mehrfach).'},400);
      const tokenHash=await hash(token);
      const found=await admin.from('account_emails').select('user_id').eq('reset_token_hash',tokenHash).gt('reset_expires_at',new Date().toISOString()).not('verified_at','is',null).maybeSingle();
      if(found.error)throw found.error;
      if(!found.data)return json({error:'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'},400);
      const profile=await admin.from('profiles').select('username').eq('user_id',found.data.user_id).maybeSingle();
      if(!profile.data)return json({error:'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'},400);
      try{if(await isPwnedPassword(newPassword))return json({error:'Dieses Passwort ist aus bekannten Datenlecks bekannt. Bitte verwende ein anderes Passwort.'},400);}catch(error){console.error('account-email: leaked-password check unavailable, password accepted unchecked:',error instanceof Error?error.message:String(error));}
      // Der Link wird zuerst verbraucht (nur wer ihn noch unverbraucht trifft, darf weiter) – so gilt er genau einmal.
      const used=await admin.from('account_emails').update({reset_token_hash:null,reset_expires_at:null}).eq('user_id',found.data.user_id).eq('reset_token_hash',tokenHash).select('user_id');
      if(used.error)throw used.error;
      if(!used.data?.length)return json({error:'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'},400);
      const updated=await admin.auth.admin.updateUserById(found.data.user_id,{password:newPassword});
      if(updated.error)return json({error:'Das Passwort konnte nicht geändert werden. Bitte fordere einen neuen Link an.'},500);
      // Wer das alte Passwort kannte, wird auf allen Geräten abgemeldet.
      const revoked=await admin.rpc('revoke_user_sessions',{p_user:found.data.user_id});
      if(revoked.error)console.error('account-email: sessions not revoked:',revoked.error.message);
      return json({username:profile.data.username});
    }
    return json({error:'Unbekannte Aktion.'},400);
  }catch(error){
    console.error('account-email:',error instanceof Error?error.message:String(error));
    return json({error:'Ungültige Anfrage.'},400);
  }
});
