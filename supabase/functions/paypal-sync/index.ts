// Zahlungseingänge von PayPal abfragen und als Monatssummen speichern (für die Verwaltung und den Monatsziel-Balken).
//
// Datenschutz: PayPal wird nur nach dem Abschnitt transaction_info gefragt (fields=transaction_info) – also Betrag,
// Gebühr, Datum und Zahlungsart. Namen, E-Mail-Adressen und Anschriften der Unterstützer werden nicht abgerufen.
// Gespeichert werden nur Summen je Monat, keine einzelnen Zahlungen.
//
// Aufruf: stündlich durch pg_cron (ohne Anmeldung – dann höchstens einmal in 55 Minuten, egal wer ruft) oder von der
// Verwaltung (angemeldeter Admin, höchstens alle 2 Minuten). Ein Abruf liest nur bei PayPal und speichert Summen.
// Secrets: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (Live-App mit „Transaction Search“).
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {berlinMonth,monthStart,summarize,type Info} from '../_shared/paypal-month.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const PAYPAL='https://api-m.paypal.com';
async function paypalToken(id:string,secret:string){
  const r=await fetch(`${PAYPAL}/v1/oauth2/token`,{method:'POST',headers:{Authorization:'Basic '+btoa(`${id}:${secret}`),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`PayPal-Anmeldung fehlgeschlagen (${r.status}). Client-ID und Secret prüfen.`);
  return (await r.json()).access_token as string;
}
async function monthItems(token:string,start:string,end:string){
  const out:Info[]=[];
  for(let page=1;page<=20;page++){
    const q=new URLSearchParams({start_date:start,end_date:end,fields:'transaction_info',transaction_status:'S',page_size:'500',page:String(page)});
    const r=await fetch(`${PAYPAL}/v1/reporting/transactions?${q}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    if(r.status===403)throw new Error('PayPal verweigert die Abfrage – ist „Transaction Search“ bei der App angehakt?');
    if(!r.ok)throw new Error(`PayPal-Abfrage fehlgeschlagen (${r.status}).`);
    const data=await r.json();
    for(const d of data.transaction_details||[])if(d?.transaction_info)out.push(d.transaction_info);
    if(page>=(Number(data.total_pages)||1))break;
  }
  return out;
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Methode nicht erlaubt.'},405);
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  // Wer darf? Ein angemeldeter Admin (alle 2 Minuten) – sonst gilt der Aufruf als stündlicher Auftrag (alle 55 Minuten).
  const auth=req.headers.get('Authorization')||'';
  let gap=55*60000;
  if(/^Bearer .+/.test(auth)){
    const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{autoRefreshToken:false,persistSession:false}});
    const {data,error}=await user.rpc('admin_api',{action:'status',payload:{}});
    if(error)return json({error:'Bitte neu anmelden.'},401);
    if(data?.admin!==true)return json({error:'Keine Berechtigung.'},403);
    gap=120000;
  }
  const {data:state}=await db.rpc('admin_money_state');
  if(state?.last_try&&Date.now()-Date.parse(state.last_try)<gap)return json({ok:true,skipped:'Gerade erst abgefragt.'});
  await db.rpc('admin_money_store',{p:{touch:true}});
  const id=Deno.env.get('PAYPAL_CLIENT_ID'),secret=Deno.env.get('PAYPAL_CLIENT_SECRET');
  if(!id||!secret){await db.rpc('admin_money_store',{p:{error:'PayPal ist noch nicht verbunden.'}});return json({error:'PayPal ist noch nicht verbunden.'},503);}
  try{
    const token=await paypalToken(id,secret),now=new Date(),{year,month}=berlinMonth(now);
    // Normal: dieser und der letzte Monat (PayPal liefert mit bis zu 3 Stunden Verzögerung). Beim ersten Mal: 6 Monate.
    const back=state?.empty?5:1,months=[];
    for(let k=back;k>=0;k--){
      const start=monthStart(year,month-k),endIso=monthStart(year,month-k+1);
      const end=Date.parse(endIso)>now.getTime()?now.toISOString().replace(/\.\d{3}Z$/,'Z'):endIso;
      const s=summarize(await monthItems(token,start,end));
      months.push({month:start.slice(0,7),...s});
    }
    const {error}=await db.rpc('admin_money_store',{p:{months}});
    if(error)throw new Error('Speichern fehlgeschlagen.');
    return json({ok:true,months:months.length});
  }catch(e){
    const message=e instanceof Error?e.message:'Unbekannter Fehler.';
    await db.rpc('admin_money_store',{p:{error:message}});
    return json({error:message},502);
  }
});
