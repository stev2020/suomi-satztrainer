// Reine Hilfsfunktionen für paypal-sync (ohne Netzwerk) – auch von node getestet (test-paypal-month.mjs).
const TZ='Europe/Berlin';

/** Zeitversatz von Berlin zu einem Zeitpunkt, z. B. "+02:00". */
export function berlinOffset(date:Date){
  const part=new Intl.DateTimeFormat('en-US',{timeZone:TZ,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value||'GMT+01:00';
  const m=part.match(/GMT([+-]\d{2}):?(\d{2})?/);return m?`${m[1]}:${m[2]||'00'}`:'+00:00';
}
/** Jahr und Monat (1–12) in Berlin. */
export function berlinMonth(date:Date){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit'}).formatToParts(date);
  return {year:Number(p.find(x=>x.type==='year')!.value),month:Number(p.find(x=>x.type==='month')!.value)};
}
/** Monatsanfang in Berlin als ISO-Zeit mit Versatz. */
export function monthStart(year:number,month:number){
  const y=month>12?year+1:month<1?year-1:year,m=((month-1+12)%12)+1;
  const probe=new Date(Date.UTC(y,m-1,1,12));
  return `${y}-${String(m).padStart(2,'0')}-01T00:00:00${berlinOffset(probe)}`;
}

export type Info={transaction_event_code?:string;transaction_initiation_date?:string;transaction_status?:string;
  transaction_amount?:{currency_code?:string;value?:string};fee_amount?:{currency_code?:string;value?:string}};

/** Monatssumme aus den transaction_info-Einträgen: Zahlungseingänge (T00xx, positiv) minus Erstattungen (T11xx). */
export function summarize(items:Info[]){
  let gross=0,fees=0,payments=0,recurring=0,last:string|null=null;
  for(const t of items){
    if(t.transaction_status&&t.transaction_status!=='S')continue;
    if(t.transaction_amount?.currency_code!=='EUR')continue;
    const code=String(t.transaction_event_code||''),amount=Number(t.transaction_amount?.value)||0,fee=Number(t.fee_amount?.value)||0;
    if(/^T00/.test(code)&&amount>0){
      gross+=amount;fees+=Math.abs(fee);payments++;if(code==='T0002')recurring++;
      if(t.transaction_initiation_date&&(!last||t.transaction_initiation_date>last))last=t.transaction_initiation_date;
    }else if(/^T11/.test(code)&&amount<0){
      gross+=amount;fees-=Math.abs(fee);
    }
  }
  const r=(n:number)=>Math.round(n*100)/100;
  return {gross:r(gross),fees:r(Math.max(0,fees)),payments,recurring,last_payment_at:last};
}

