// Vanamo – Verwaltung: Übersicht (Zahlen, Unterstützungen, Zu erledigen) und Einstellungen.
// Die Seite zeigt nur, was die Datenbank einem Admin zurückgibt: Summen und Zählungen, keine Konten.
// Alle Texte aus Meldungen und Rückmeldungen werden als Text eingesetzt, nie als HTML.

const MONTHS=['Jan.','Feb.','März','Apr.','Mai','Juni','Juli','Aug.','Sep.','Okt.','Nov.','Dez.'];
const MONTHS_LONG=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const nf=new Intl.NumberFormat('de-DE');
const ef=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const euro=n=>ef.format(Number(n)||0);
export const num=n=>n==null?'–':nf.format(Number(n));

/** „gerade eben“, „vor 12 Min.“, „vor 2 Std.“, „gestern“, „vor 3 Tagen“, sonst Datum. */
export function relTime(iso,now=Date.now()){
 const t=Date.parse(iso);if(!Number.isFinite(t))return '';
 const s=Math.max(0,(now-t)/1000);
 if(s<90)return 'gerade eben';
 if(s<3600)return `vor ${Math.round(s/60)} Min.`;
 const day=d=>new Date(d).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
 const today=day(now),then=day(t),yesterday=day(now-86400000);
 if(then===today)return `vor ${Math.round(s/3600)} Std.`;
 if(then===yesterday)return 'gestern';
 const days=Math.round((Date.parse(today)-Date.parse(then))/86400000);
 if(days<14)return `vor ${days} Tagen`;
 return new Date(t).toLocaleDateString('de-DE',{day:'numeric',month:'short',timeZone:'Europe/Berlin'});
}

/** Veränderung in Prozent, z. B. "+8 %"; null, wenn es keinen Vergleich gibt. */
export function deltaPercent(now,before){
 if(now==null||before==null||!(Number(before)>0))return null;
 const p=Math.round((Number(now)-Number(before))/Number(before)*100);
 return {text:(p>0?'+':p<0?'−':'±')+Math.abs(p)+' %',dir:p>0?'up':p<0?'down':''};
}

/** Die letzten 6 Monate (ältester zuerst), fehlende Monate mit 0. */
export function monthSeries(months=[],now=new Date()){
 const [y,m]=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}).split('-').map(Number);
 const byKey=new Map(months.map(x=>[x.month,x]));
 const out=[];
 for(let k=5;k>=0;k--){
  const d=new Date(Date.UTC(y,m-1-k,1)),key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  const v=byKey.get(key)||{};
  out.push({key,label:MONTHS[d.getUTCMonth()],name:MONTHS_LONG[d.getUTCMonth()],gross:Number(v.gross)||0,fees:Number(v.fees)||0,payments:Number(v.payments)||0,recurring:Number(v.recurring)||0});
 }
 return out;
}

/** Plattformen eines Fehlers, häufigste zuerst: "Android · Chrome 129 (5×)". */
export function platformsText(platforms={}){
 return Object.entries(platforms||{}).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k.replace(/^ · | · $/g,'')||'unbekannt'} (${n}×)`).join(', ');
}

/** Zu erledigen: Meldungen aus Klassenräumen zuerst (rechtswidrig ganz oben), dann gemeldete Sätze, Seitenfehler und Rückmeldungen. */
export function todoItems(reports=[],errors=[],feedback=[],classReports=[]){
 const urgent=c=>Number(c.reasons?.illegal||0)>0;
 const classes=[...classReports].sort((a,b)=>Number(urgent(b))-Number(urgent(a))||Date.parse(b.last_at)-Date.parse(a.last_at)).map(c=>({kind:'class',at:c.last_at,data:c}));
 return [...classes,...[
  ...reports.map(r=>({kind:'report',at:r.updated_at||r.created_at,data:r})),
  ...errors.filter(e=>e.status==='new').map(e=>({kind:'error',at:e.last_seen,data:e})),
  ...feedback.map(f=>({kind:'feedback',at:f.created_at,data:f})),
 ].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))];
}

export const CLASS_REASONS={illegal:'rechtswidrig',harassment:'Belästigung',inappropriate:'unpassend',spam:'Spam',other:'Sonstiges'};
const CLASS_KIND={post:'Beitrag',message:'Diskussionsnachricht',room:'Raum'};
export const fileSize=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(n/1024))+' KB';
/** Gründe einer Meldung: "2× rechtswidrig, 1× unpassend". */
export function reasonsText(reasons={}){
 return Object.entries(reasons||{}).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${n}× ${CLASS_REASONS[k]||k}`).join(', ');
}

const CATEGORY={translation:'Übersetzung falsch',unnatural:'Unnatürlich',outdated:'Veraltet',inappropriate:'Ungeeignet',duplicate:'Doppelt',grammar:'Grammatikhilfe',audio:'Aufnahme',level:'Falsches Level',other:'Sonstiges'};

function barsMarkup(values,{labels,tips,current}){
 const max=Math.max(1,...values);
 return values.map((v,i)=>`<div class="admin-bar${i===current?' now':''}" tabindex="0" aria-label="${esc(tips[i])}"><i style="height:${Math.round(v/max*100)}%"></i><span>${esc(tips[i])}</span></div>`).join('');
}

function classMarkup(d,when){
 const c=d.content||{},room=d.room||{},illegal=Number(d.reasons?.illegal||0)>0,key=`data-kind="${esc(d.target_kind)}" data-id="${esc(d.target_id)}"`;
 const body=d.target_kind==='room'?`<p><strong>${esc(room.name)}</strong> · ${num(room.members)} Mitglieder${room.archived?' · archiviert':''}</p>`
  :`${c.parent?`<p class="admin-muted">Antwort auf: „${esc(String(c.parent).slice(0,140))}“</p>`:''}${c.assignment?`<p class="admin-muted">In der Aufgabe „${esc(c.assignment)}“</p>`:''}
   <blockquote class="admin-quote">${c.deleted?'<em>schon entfernt</em>':esc(c.body)}</blockquote>
   ${(c.files||[]).length?`<p class="admin-muted">Dateien: ${c.files.map(f=>`${esc(f.name)} (${esc(f.mime)}, ${fileSize(Number(f.size)||0)})`).join(', ')} – werden hier nicht geöffnet.</p>`:''}
   <p class="admin-muted">Von: ${esc(c.role||'Mitglied')} · Raum „${esc(room.name)}“${room.archived?' (archiviert)':''}</p>`;
 return `<div class="admin-item${illegal?' urgent':''}"><div class="admin-row"><span class="admin-pill ${illegal?'error':'report'}">${esc(CLASS_KIND[d.target_kind]||'Inhalt')} gemeldet · ${esc(reasonsText(d.reasons))}</span>${when}</div>
  ${body}
  ${(d.notes||[]).length?`<p class="admin-muted">Hinweise: ${d.notes.map(n=>`„${esc(n)}“`).join(' · ')}</p>`:''}
  <div class="admin-actions">${d.target_kind!=='room'?`<button type="button" class="admin-btn danger" data-class-resolve="remove" ${key}>Entfernen</button>`:''}<button type="button" class="admin-btn ${d.target_kind==='room'?'danger':'quiet'}" data-class-resolve="archive" ${key}>Raum archivieren</button><button type="button" class="admin-btn quiet" data-class-resolve="keep" ${key}>Behalten</button></div></div>`;
}

function todoMarkup(item,now){
 const d=item.data,when=`<span class="admin-muted">${esc(relTime(item.at,now))}</span>`;
 if(item.kind==='class')return classMarkup(d,when);
 if(item.kind==='report'){
  const snap=d.snapshot||{};
  return `<div class="admin-item"><div class="admin-row"><span class="admin-pill report">Satz gemeldet · ${esc(CATEGORY[d.category]||d.category||'Hinweis')}</span>${when}</div>
   <p class="fi" lang="fi">${esc(snap.sentence_text||'#'+d.sentence_id)}</p>${snap.translation_text?`<p class="admin-muted" lang="de">${esc(snap.translation_text)}</p>`:''}
   ${d.note?`<p class="admin-muted">Hinweis: „${esc(d.note)}“</p>`:''}
   <div class="admin-actions"><button type="button" class="admin-btn" data-report="${esc(d.id)}" data-decision="restore">Freigeben</button><button type="button" class="admin-btn danger" data-report="${esc(d.id)}" data-decision="disable">Ausschließen</button></div></div>`;
 }
 if(item.kind==='error'){
  return `<div class="admin-item"><div class="admin-row"><span class="admin-pill error">Seitenfehler · ${num(d.hits)}×</span>${when}</div>
   <p><code>${esc(d.message)}</code></p>
   <div class="admin-row"><span class="admin-muted">${esc([d.source,d.page].filter(Boolean).join(' · '))}${d.platforms?' · '+esc(platformsText(d.platforms)):''}</span>
   <button type="button" class="admin-btn" data-error="${esc(d.fingerprint)}">Erledigt</button></div></div>`;
 }
 return `<div class="admin-item"><div class="admin-row"><span class="admin-pill report">Rückmeldung</span>${when}</div>
  <p>„${esc(d.message)}“</p>
  <div class="admin-actions"><button type="button" class="admin-btn quiet" data-feedback="${esc(d.id)}">Archivieren</button></div></div>`;
}

const LOCK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** Übersicht als HTML (nur Zahlen und bereinigte Texte). */
export function overviewMarkup(o,{reports=[],errors=[],feedback=[],classReports=[],showAll=false,now=Date.now()}={}){
 const a=o.accounts||{},act=o.activity||{},money=o.money||{},cls=o.classrooms||{},sw=o.swarm||{},min=o.min_group||5;
 const small=`<div class="admin-sub" title="Erst ab ${min} Lernenden, damit niemand Einzelnes erkennbar ist">ab ${min} Lernenden</div>`;
 const delta=deltaPercent(act.practiced_7,act.practiced_prev7);
 const emailPct=a.total?Math.round(a.with_email/a.total*100):0;
 const series=monthSeries(money.months||[],now),cur=series.at(-1),goal=Number(money.goal)||10;
 const goalPct=Math.min(100,Math.round(cur.gross/goal*100));
 const weekly=(a.weekly||[]).map(w=>Number(w.n)||0);
 const weekTips=(a.weekly||[]).map((w,i)=>`${i===weekly.length-1?'diese Woche':'Woche ab '+new Date(w.week+'T12:00:00Z').toLocaleDateString('de-DE',{day:'numeric',month:'numeric'})}: ${w.n} neu`);
 const moneyState=money.last_error?`<span class="admin-muted"><span class="admin-dot off"></span>${esc(money.last_error)}</span>`
  :money.last_ok?`<span class="admin-muted"><span class="admin-dot"></span>PayPal · Stand ${esc(relTime(money.last_ok,now))}</span>`
  :`<span class="admin-muted"><span class="admin-dot off"></span>PayPal noch nicht abgefragt</span>`;
 const todo=todoItems(reports,errors,feedback,classReports),shown=showAll?todo:todo.slice(0,5);
 return `
 <div class="admin-top"><div><div class="admin-eyebrow">Verwaltung · nur für dich</div><h1>Alles auf einen Blick</h1></div>
  <span class="admin-muted">Stand: ${esc(new Date(now).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}))} Uhr · <button type="button" class="admin-more" style="display:inline;margin:0" data-action="reload">aktualisieren</button></span></div>
 <div class="admin-kpis">
  <div class="admin-card"><div class="admin-num">${num(a.total)}</div><div class="admin-lbl">Konten</div><div class="admin-sub${a.new7?' up':''}">+${num(a.new7)} in 7 Tagen</div></div>
  <div class="admin-card"><div class="admin-num">${num(act.today)}</div><div class="admin-lbl">heute aktiv</div><div class="admin-sub">${num(act.d7)} in 7 Tagen</div></div>
  <div class="admin-card"><div class="admin-num">${num(act.practiced_today)}</div><div class="admin-lbl">Sätze geübt heute</div>${act.practiced_today==null?small:delta?`<div class="admin-sub ${delta.dir}">${delta.text} zur Vorwoche</div>`:''}</div>
  <div class="admin-card"><div class="admin-num">${emailPct} %</div><div class="admin-lbl">mit E-Mail gesichert</div><div class="admin-sub">${num(a.with_email)} von ${num(a.total)}</div></div>
  <div class="admin-card"><div class="admin-num">${num(cls.rooms)}</div><div class="admin-lbl">Klassenräume</div><div class="admin-sub">${num(cls.members)} Mitglieder</div></div>
 </div>
 <div class="admin-grid">
  <div class="admin-col">
   <section class="admin-card" aria-labelledby="admin-money-title"><div class="admin-card-head"><h2 id="admin-money-title">Unterstützungen</h2>${moneyState}</div>
    <div class="admin-money">
     <div><div class="admin-lbl" style="margin:0 0 6px">${esc(cur.name)} eingegangen</div><div class="admin-num">${euro(cur.gross)}</div>
      <div class="admin-muted" style="margin-top:6px">nach Gebühren ${euro(cur.gross-cur.fees)}</div>
      <div class="admin-goal" role="progressbar" aria-label="Monatsziel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goalPct}"><i style="width:${goalPct}%"></i></div>
      <div class="admin-row" style="font-size:12.5px"><span class="admin-muted">Monatsziel</span><b>${goalPct} % von ${euro(goal)}</b></div></div>
     <div><div class="admin-bars small">${barsMarkup(series.map(s=>s.gross),{tips:series.map(s=>`${s.label}: ${euro(s.gross)}`),current:5})}</div>
      <div class="admin-axis"><span>${esc(series[0].label)}</span><span>${esc(cur.label)}</span></div></div>
    </div>
    <div class="admin-facts"><div><div class="n">${num(cur.payments)}</div><div class="admin-lbl">Zahlungen diesen Monat</div></div><div><div class="n">${num(cur.recurring)}</div><div class="admin-lbl">davon wiederkehrend</div></div><div><div class="n">${money.last_payment_at?esc(relTime(money.last_payment_at,now)):'–'}</div><div class="admin-lbl">letzter Eingang</div></div></div>
    <div class="admin-row" style="margin-top:14px"><span class="admin-status" id="admin-money-status"></span><button type="button" class="admin-btn quiet" data-action="paypal">Jetzt bei PayPal abfragen</button></div>
   </section>
   <section class="admin-card" aria-labelledby="admin-weeks-title"><div class="admin-card-head"><h2 id="admin-weeks-title">Neue Konten pro Woche</h2><span class="admin-muted">12 Wochen</span></div>
    <div class="admin-bars">${barsMarkup(weekly,{tips:weekTips,current:weekly.length-1})}</div>
    <div class="admin-axis"><span>vor 12 Wochen</span><span>diese Woche</span></div>
    <div class="admin-mini"><div><div class="n">${act.streak_avg==null?'–':esc(String(act.streak_avg).replace('.',','))}</div><div class="admin-lbl">Tage Serie im Schnitt${act.streak_avg==null?` (ab ${min})`:''}</div></div><div><div class="n">${num(act.d30)}</div><div class="admin-lbl">in 30 Tagen aktiv</div></div><div><div class="n">${num(sw.names)}</div><div class="admin-lbl">Namen im Schwarm</div></div></div>
   </section>
   <div class="admin-priv">${LOCK}<div><b>Datenschutz:</b> Hier stehen nur Zahlen – keine Namen, keine E-Mail-Adressen, keine Lernverläufe einzelner Personen. Summen und Durchschnitte erscheinen erst ab ${min} Lernenden. Von PayPal werden nur Beträge abgefragt, nie Namen oder Adressen. Seitenfehler sind anonym und werden nach 30 Tagen gelöscht.</div></div>
  </div>
  <div class="admin-col">
   <section class="admin-card" aria-labelledby="admin-todo-title"><div class="admin-card-head"><h2 id="admin-todo-title">Zu erledigen</h2>${todo.length?`<span class="admin-pill count">${todo.length}</span>`:''}</div>
    <p class="admin-status" id="admin-todo-status" role="status"></p>
    ${shown.map(i=>todoMarkup(i,now)).join('')||'<p class="admin-empty">Nichts offen. Schön.</p>'}
    ${todo.length>shown.length?`<button type="button" class="admin-more" data-action="more">${todo.length-shown.length} weitere anzeigen</button>`:''}
   </section>
  </div>
 </div>`;
}

/** Klassenräume: nur Kennzahlen, keine Inhalte. */
export function roomsMarkup(rooms=[],{now=Date.now(),confirm=''}={}){
 const row=r=>`<tr${Number(r.open_reports)?' class="flag"':''}><th scope="row"><strong>${esc(r.name)}</strong><small>seit ${esc(r.created)}${r.archived?' · archiviert':''}</small></th>
  <td>${num(r.members)}<small>${num(r.teachers)} Lehrkr.</small></td><td>${num(r.posts_30d)} / ${num(r.messages_30d)}<small>${num(r.assignments)} Aufgaben</small></td>
  <td>${num(r.files)}<small>${fileSize(Number(r.file_bytes)||0)}</small></td><td>${r.last_activity?esc(relTime(r.last_activity,now)):'–'}</td>
  <td>${Number(r.open_reports)?`<span class="admin-pill error">${num(r.open_reports)}</span>`:'–'}</td>
  <td class="admin-room-actions">${r.archived?'':`<button type="button" class="admin-btn quiet" data-room-archive="${esc(r.id)}">Archivieren</button>`}${confirm===r.id?`<form class="admin-room-delete" data-room-delete="${esc(r.id)}"><input class="admin-field" name="confirm" placeholder="Raumname zur Bestätigung" aria-label="Raumname zur Bestätigung" autocomplete="off"><button type="submit" class="admin-btn danger">Endgültig löschen</button></form>`:`<button type="button" class="admin-btn danger" data-room-delete-ask="${esc(r.id)}">Löschen</button>`}</td></tr>`;
 return `<div class="admin-top"><div><div class="admin-eyebrow">Verwaltung</div><h1>Klassenräume</h1></div><span class="admin-muted">${num(rooms.length)} Räume</span></div>
 <div class="admin-priv" style="margin:18px 0">${LOCK}<div><b>Ohne Inhalte:</b> Hier stehen nur Kennzahlen je Raum. Beiträge siehst du nur, wenn sie gemeldet werden – unter „Zu erledigen“ in der Übersicht. Archivieren macht einen Raum schreibgeschützt; Löschen entfernt ihn mit allen Inhalten und Dateien.</div></div>
 <p class="admin-status" id="admin-rooms-status" role="status"></p>
 <div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Raum</th><th>Mitglieder</th><th>Beiträge / Nachrichten (30 Tage)</th><th>Dateien</th><th>Zuletzt aktiv</th><th>Meldungen</th><th><span class="sr-only">Aktionen</span></th></tr></thead>
 <tbody>${rooms.map(row).join('')||'<tr><td colspan="7" class="admin-muted">Noch keine Klassenräume.</td></tr>'}</tbody></table></div>`;
}

/** Einstellungen als HTML. */
export function settingsMarkup(s,{now=Date.now()}={}){
 const sw=(id,on,label,hint)=>`<div class="admin-set"><span id="${id}-label">${label}${hint?`<small>${hint}</small>`:''}</span><button type="button" class="admin-switch" role="switch" id="${id}" aria-checked="${on?'true':'false'}" aria-labelledby="${id}-label"></button></div>`;
 const chips=(s.swarm||[]).map(n=>`<span class="admin-chip${n.contributor?' contrib':''}">${esc(n.name)}${n.contributor?'':` <small>bis ${esc(new Date(n.until).toLocaleDateString('de-DE',{day:'numeric',month:'short'}))}</small>`}<button type="button" data-remove="${esc(n.id)}" aria-label="${esc(n.name)} entfernen">×</button></span>`).join('');
 const m=s.money||{};
 return `
 <div class="admin-settings">
  <div style="margin-bottom:24px"><div class="admin-eyebrow">Verwaltung</div><h1>Einstellungen</h1><p class="admin-muted" style="font-size:15px;margin:6px 0 0">Änderungen gelten für alle, sobald du gespeichert hast.</p></div>
  <form id="admin-settings-form" novalidate>
  <section class="admin-card"><h2>Unterstützen-Seite</h2>
   <div class="admin-set"><label for="set-goal">Monatsziel<small>Bei diesem Betrag ist der Balken auf der Seite voll.</small></label><span><input id="set-goal" class="admin-field money" inputmode="decimal" autocomplete="off" value="${esc(String(s.month_goal).replace('.',','))}"> €</span></div>
  </section>
  <section class="admin-card"><h2>Hinweis an alle</h2><p class="admin-hint">Ein schmales Band oben in der App, zum Beispiel bei einer Wartung.</p>
   ${sw('set-notice',s.notice_on,'Hinweis zeigen')}
   <div class="admin-set"><input id="set-notice-text" class="admin-field wide" maxlength="200" placeholder="z. B. Heute ab 22 Uhr kurze Wartung – dein Fortschritt bleibt erhalten." value="${esc(s.notice_text)}" aria-label="Text des Hinweises">
    <span class="admin-seg" role="group" aria-label="Art des Hinweises"><button type="button" data-kind="info" aria-pressed="${s.notice_kind!=='warn'}">Info</button><button type="button" data-kind="warn" aria-pressed="${s.notice_kind==='warn'}">Warnung</button></span></div>
  </section>
  <section class="admin-card"><h2>Registrierung &amp; Fehler</h2>
   ${sw('set-registration',s.registration_open,'Neue Registrierungen erlauben','Aus: Bestehende Konten funktionieren weiter, neue können nicht angelegt werden.')}
   ${sw('set-errors',s.collect_errors,'Seitenfehler sammeln','Anonym, ohne Konto und IP-Adresse; Löschung nach 30 Tagen.')}
  </section>
  <div class="admin-save"><span class="admin-status" id="admin-save-status" role="status">${s.updated_at?`Zuletzt gespeichert: ${esc(relTime(s.updated_at,now))}`:''}</span><button type="submit" class="admin-btn">Speichern</button></div>
  </form>
  <section class="admin-card"><h2>Schwarm</h2><p class="admin-hint">Mitwirkende (lila) bleiben, bis du sie entfernst. Unterstützer verschwinden nach 6 Monaten von selbst.</p>
   <div class="admin-chips">${chips||'<span class="admin-muted">Noch keine Namen im Schwarm.</span>'}</div>
   <form class="admin-add" id="admin-contrib-form"><input id="set-contrib" class="admin-field" maxlength="20" autocomplete="off" placeholder="Vorname einer mitwirkenden Person" aria-label="Vorname einer mitwirkenden Person"><button type="submit" class="admin-btn">Hinzufügen</button></form>
   <p class="admin-status" id="admin-swarm-status" role="status"></p>
  </section>
  <section class="admin-card"><h2>Verbindungen</h2>
   <div class="admin-set"><span>PayPal · Zahlungseingänge<small>Fragt nur Beträge, Gebühren und Datum ab – keine Namen oder Adressen. Stündlich von selbst.</small></span>
    <span class="admin-muted">${m.last_error?`<span class="admin-dot off"></span>${esc(m.last_error)}`:m.last_ok?`<span class="admin-dot"></span>verbunden · ${esc(relTime(m.last_ok,now))}`:'<span class="admin-dot off"></span>noch nicht abgefragt'}</span></div>
  </section>
 </div>`;
}

if(typeof document!=='undefined'){
 const auth=await import('./admin-session.mjs?v=3');
 const {adminApi,reviewApi,syncPaypal}=auth;
 const $=id=>document.getElementById(id);
 const root=$('admin');
 let state={overview:null,reports:[],errors:[],feedback:[],classReports:[],rooms:[],settings:null,showAll:false,confirmRoom:''},ready=false,factorId='';

 const gate=(title,text)=>{root.innerHTML=`<div class="admin-gate admin-card"><h1>${esc(title)}</h1><p>${text}</p><p><button type="button" class="admin-btn" data-action="logout">Abmelden</button></p></div>`;};
 const view=()=>location.hash==='#einstellungen'?'settings':location.hash==='#klassenraeume'?'rooms':'overview';
 function nav(){document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===view())a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
 const setChrome=on=>{document.querySelector('.admin-nav').hidden=!on;$('admin-logout').hidden=!auth.currentSession();};

 // ---- Anmeldung: Passwort, dann Code aus der Authenticator-App ----
 function loginForm(message=''){
  ready=false;setChrome(false);
  root.innerHTML=`<form class="admin-gate admin-card admin-login" id="admin-login-form" novalidate><div class="admin-eyebrow">Verwaltung</div><h1>Anmelden</h1>
   <p>Mit dem eigenen Verwaltungskonto – nicht mit deinem Lernkonto.</p>
   <label>Benutzername<input id="admin-user" class="admin-field" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
   <label>Passwort<input id="admin-pass" class="admin-field" type="password" autocomplete="current-password" required></label>
   <button type="submit" class="admin-btn">Weiter</button><p class="admin-status bad" id="admin-login-status" role="status">${esc(message)}</p></form>`;
  $('admin-user').focus();
 }
 function codeForm(){
  setChrome(false);
  root.innerHTML=`<form class="admin-gate admin-card admin-login" id="admin-code-form" novalidate><div class="admin-eyebrow">Zweiter Schritt</div><h1>Code eingeben</h1>
   <p>Den 6-stelligen Code aus deiner Authenticator-App.</p>
   <label>Code<input id="admin-code" class="admin-field admin-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
   <button type="submit" class="admin-btn">Anmelden</button><p class="admin-status bad" id="admin-login-status" role="status"></p>
   <p><button type="button" class="admin-more" data-action="logout">Abbrechen</button></p></form>`;
  $('admin-code').focus();
 }
 function enrollForm(qr,secret){
  setChrome(false);
  root.innerHTML=`<form class="admin-gate admin-card admin-login" id="admin-code-form" novalidate><div class="admin-eyebrow">Einmalig einrichten</div><h1>Authenticator verbinden</h1>
   <p>Scanne den QR-Code mit deiner Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator) und gib danach den angezeigten Code ein. Ab dann fragt die Verwaltung bei jeder Anmeldung nach diesem Code.</p>
   ${qr?`<img class="admin-qr" src="${esc(qr)}" alt="QR-Code für die Authenticator-App" width="200" height="200">`:''}
   <p class="admin-muted">Kein Scannen möglich? Schlüssel abtippen:<br><code class="admin-secret">${esc(secret)}</code></p>
   <label>Code aus der App<input id="admin-code" class="admin-field admin-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
   <button type="submit" class="admin-btn">Bestätigen</button><p class="admin-status bad" id="admin-login-status" role="status"></p>
   <p><button type="button" class="admin-more" data-action="logout">Abbrechen</button></p></form>`;
  $('admin-code').focus();
 }
 /** Nach dem Passwort: Code abfragen bzw. einrichten, dann Rechte prüfen. */
 async function proceed(){
  if(!auth.currentSession()){loginForm();return;}
  if(auth.level()!=='aal2'){
   const list=await auth.factors();
   const done=list.find(f=>f.status==='verified');
   if(done){factorId=done.id;codeForm();}
   else{const e=await auth.enroll();factorId=e.id;enrollForm(e.qr,e.secret);}
   return;
  }
  const s=await adminApi('status');
  if(s?.ok!==true){setChrome(false);gate('Kein Zugang','Dieses Konto ist nicht für die Verwaltung freigeschaltet.');return;}
  ready=true;setChrome(true);show();
 }

 async function loadOverview(){
  const [overview,reports,errors,feedback,classReports]=await Promise.all([adminApi('overview'),reviewApi('list_reports').catch(()=>[]),adminApi('errors'),adminApi('feedback'),adminApi('class_reports').catch(()=>[])]);
  state={...state,overview,reports:Array.isArray(reports)?reports:[],errors,feedback,classReports:Array.isArray(classReports)?classReports:[]};
 }
 function render(){
  nav();
  if(view()==='settings'){root.innerHTML=settingsMarkup(state.settings);document.title='Einstellungen · Vanamo';}
  else if(view()==='rooms'){root.innerHTML=roomsMarkup(state.rooms,{confirm:state.confirmRoom});document.title='Klassenräume · Vanamo';}
  else{root.innerHTML=overviewMarkup(state.overview,state);document.title='Verwaltung · Vanamo';}
 }
 async function show(){
  if(!ready)return;
  try{
   if(view()==='settings')state.settings=await adminApi('settings');
   else if(view()==='rooms'){state.rooms=await adminApi('class_rooms');state.confirmRoom='';}
   else await loadOverview();
   render();
  }catch(e){gate('Das hat nicht geklappt',esc(e.message));}
 }
 const status=(id,text,kind='')=>{const el=$(id);if(el){el.textContent=text;el.className='admin-status'+(kind?' '+kind:'');}};

 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.action==='logout'){await auth.logout();loginForm();return;}
  if(b.dataset.action==='reload'){show();return;}
  if(b.dataset.action==='more'){state.showAll=true;render();return;}
  if(b.dataset.action==='paypal'){
   b.disabled=true;status('admin-money-status','Frage bei PayPal nach …');
   try{const r=await syncPaypal();if(r.skipped){status('admin-money-status',r.skipped);b.disabled=false;return;}await show();}
   catch(err){status('admin-money-status',err.message,'bad');b.disabled=false;}
   return;
  }
  const act=async(task)=>{b.disabled=true;try{await task();await show();}catch(err){status('admin-todo-status',err.message,'bad');b.disabled=false;}};
  if(b.dataset.report){act(()=>reviewApi('resolve_report',{report_id:b.dataset.report,decision:b.dataset.decision}));return;}
  if(b.dataset.error){act(()=>adminApi('error_done',{fingerprint:b.dataset.error}));return;}
  if(b.dataset.feedback){act(()=>adminApi('feedback_archive',{id:b.dataset.feedback}));return;}
  if(b.dataset.classResolve){act(async()=>{const r=await adminApi('class_resolve',{target_kind:b.dataset.kind,target_id:b.dataset.id,decision:b.dataset.classResolve});if(r?.files_removed)await auth.sweepFiles().catch(()=>{});});return;}
  if(b.dataset.roomArchive){b.disabled=true;try{await adminApi('class_room_archive',{room_id:b.dataset.roomArchive});await show();}catch(err){status('admin-rooms-status',err.message,'bad');b.disabled=false;}return;}
  if(b.dataset.roomDeleteAsk){state.confirmRoom=b.dataset.roomDeleteAsk;render();root.querySelector('.admin-room-delete input')?.focus();return;}
  // Einstellungen: Schalter und Hinweisart
  if(b.getAttribute('role')==='switch'){b.setAttribute('aria-checked',String(b.getAttribute('aria-checked')!=='true'));return;}
  if(b.dataset.kind){b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));return;}
  // Namen entfernen: erst nachfragen (zweiter Klick), kein Browser-Dialog.
  if(b.dataset.remove){
   if(!b.classList.contains('confirm')){b.classList.add('confirm');b.textContent='Entfernen?';setTimeout(()=>{if(b.isConnected){b.classList.remove('confirm');b.textContent='×';}},4000);return;}
   b.disabled=true;
   try{await adminApi('swarm_remove',{id:b.dataset.remove});state.settings=await adminApi('settings');render();status('admin-swarm-status','Entfernt.','ok');}
   catch(err){status('admin-swarm-status',err.message,'bad');b.disabled=false;}
  }
 });
 root.addEventListener('submit',async e=>{
  e.preventDefault();
  if(e.target.id==='admin-login-form'||e.target.id==='admin-code-form'){
   const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;status('admin-login-status','');
   try{
    if(e.target.id==='admin-login-form')await auth.login($('admin-user').value,$('admin-pass').value);
    else await auth.verify(factorId,$('admin-code').value);
    await proceed();
   }catch(err){status('admin-login-status',err.message,'bad');btn.disabled=false;}
   return;
  }
  if(e.target.dataset.roomDelete){
   const btn=e.target.querySelector('button');btn.disabled=true;
   try{await adminApi('class_room_delete',{room_id:e.target.dataset.roomDelete,confirm_name:e.target.confirm.value});await auth.sweepFiles().catch(()=>{});await show();status('admin-rooms-status','Raum gelöscht.','ok');}
   catch(err){status('admin-rooms-status',err.message,'bad');btn.disabled=false;}
   return;
  }
  if(e.target.id==='admin-contrib-form'){
   const input=$('set-contrib');
   try{await adminApi('contributor_add',{name:input.value});state.settings=await adminApi('settings');render();status('admin-swarm-status','Hinzugefügt.','ok');}
   catch(err){status('admin-swarm-status',err.message,'bad');}
   return;
  }
  if(e.target.id==='admin-settings-form'){
   const on=id=>$(id).getAttribute('aria-checked')==='true';
   const payload={month_goal:$('set-goal').value.trim(),notice_on:on('set-notice'),notice_text:$('set-notice-text').value.trim(),
    notice_kind:document.querySelector('[data-kind][aria-pressed=true]')?.dataset.kind||'info',registration_open:on('set-registration'),collect_errors:on('set-errors')};
   status('admin-save-status','Speichere …');
   try{await adminApi('settings_save',payload);status('admin-save-status','Gespeichert.','ok');state.settings=await adminApi('settings');}
   catch(err){status('admin-save-status',err.message,'bad');}
  }
 });
 window.addEventListener('hashchange',show);

 $('admin-logout').addEventListener('click',async()=>{await auth.logout();loginForm();});
 auth.watchIdle(()=>loginForm('Aus Sicherheitsgründen nach 30 Minuten ohne Bedienung abgemeldet.'));
 proceed().catch(e=>loginForm(e.message));
}
