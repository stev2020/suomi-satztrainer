const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let reviewer=false,busy=false,candidates=null;

async function api(action,payload={}){
 const response=await window.suomiAccountRequest('/rest/v1/rpc/sentence_quality_review_api',{method:'POST',body:JSON.stringify({action,payload})});
 const value=await response.json().catch(()=>({}));
 if(!response.ok||value.error)throw new Error(value.error||value.message||'Qualitätsprüfung nicht verfügbar.');
 return value;
}
const pairKey=(left,right)=>`${Number(left)}:${Number(right)}`;
async function duplicateCandidates(){
 if(candidates)return candidates;
 const response=await fetch('./duplicate-candidates.json');
 if(!response.ok)throw new Error('Dublettenvorschläge konnten nicht geladen werden.');
 candidates=(await response.json()).candidates||[];
 return candidates;
}
function reportCard(report){
 const snapshot=report.snapshot||{},translation=Number(report.translation_id)>0;
 return `<article class="quality-review-card"><div class="quality-review-meta"><strong>#${Number(report.sentence_id)}${translation?` · Übersetzung #${Number(report.translation_id)}`:''}</strong><span>${esc(report.category)}</span></div><p lang="fi">${esc(snapshot.sentence_text||'Satztext nicht gespeichert')}</p>${snapshot.translation_text?`<p lang="de">${esc(snapshot.translation_text)}</p>`:''}<p class="quality-review-note">${esc(report.note||'Ohne ergänzende Notiz.')}</p><div class="quality-review-actions"><button type="button" class="quiet" data-quality-report="${esc(report.id)}" data-decision="restore">Wieder freigeben</button><button type="button" class="quiet quality-disable" data-quality-report="${esc(report.id)}" data-decision="disable">Dauerhaft ausschließen</button></div></article>`;
}
function duplicateCard(candidate){
 const left=candidate.left,right=candidate.right,score=Math.round(Number(candidate.similarity)*100);
 return `<article class="quality-review-card"><div class="quality-review-meta"><strong>${candidate.match==='exact'?'Exakte Dublette':'Sehr ähnlich'} · ${score}%</strong><span>Level ${Number(left.level)} / ${Number(right.level)}</span></div><div class="quality-duplicate-pair"><p><b>#${Number(left.id)}</b> <span lang="fi">${esc(left.text)}</span></p><p><b>#${Number(right.id)}</b> <span lang="fi">${esc(right.text)}</span></p></div><div class="quality-review-actions"><button type="button" class="quiet" data-quality-pair="${Number(left.id)}:${Number(right.id)}" data-decision="keep_both">Beide behalten</button><button type="button" class="quiet quality-disable" data-quality-pair="${Number(left.id)}:${Number(right.id)}" data-decision="disable_left">#${Number(left.id)} ausschließen</button><button type="button" class="quiet quality-disable" data-quality-pair="${Number(left.id)}:${Number(right.id)}" data-decision="disable_right">#${Number(right.id)} ausschließen</button></div></article>`;
}
async function load(){
 if(!reviewer||busy)return;
 busy=true;$('quality-review-status').textContent='Prüfliste wird geladen …';
 try{
  const [reports,decisions,allCandidates]=await Promise.all([api('list_reports'),api('list_duplicates'),duplicateCandidates()]);
  const reviewed=new Set((decisions||[]).map(item=>pairKey(item.left_sentence_id,item.right_sentence_id)));
  const openCandidates=allCandidates.filter(item=>!reviewed.has(pairKey(item.left.id,item.right.id)));
  $('quality-report-count').textContent=reports.length;
  $('quality-duplicate-count').textContent=openCandidates.length;
  $('quality-report-queue').innerHTML=reports.map(reportCard).join('')||'<p>Keine offenen Nutzerhinweise.</p>';
  $('quality-duplicate-queue').innerHTML=openCandidates.map(duplicateCard).join('')||'<p>Alle Dublettenvorschläge wurden geprüft.</p>';
  $('quality-review-status').textContent=`${reports.length} offene Hinweise · ${openCandidates.length} ungeprüfte Dubletten`;
 }catch(error){$('quality-review-status').textContent=error.message;}
 finally{busy=false;}
}
async function identify(){
 if(!window.suomiAccountUser?.())return;
 try{
  const value=await api('status');reviewer=value.reviewer===true;
  $('quality-review').hidden=!reviewer;
 }catch{return;}
}
async function decideReport(button){
 await api('resolve_report',{report_id:button.dataset.qualityReport,decision:button.dataset.decision});
}
async function decideDuplicate(button){
 const [leftId,rightId]=button.dataset.qualityPair.split(':').map(Number);
 const candidate=(await duplicateCandidates()).find(item=>Number(item.left.id)===leftId&&Number(item.right.id)===rightId);
 if(!candidate)throw new Error('Dublettenvorschlag nicht gefunden.');
 await api('resolve_duplicate',{left_sentence_id:leftId,right_sentence_id:rightId,left_text:candidate.left.text,right_text:candidate.right.text,match_kind:candidate.match,similarity:candidate.similarity,decision:button.dataset.decision});
}
$('quality-review-refresh')?.addEventListener('click',load);
$('quality-review')?.addEventListener('click',event=>{
 const button=event.target.closest('[data-quality-report],[data-quality-pair]');if(!button||busy)return;
 busy=true;button.disabled=true;$('quality-review-status').textContent='Entscheidung wird gespeichert …';
 const task=button.dataset.qualityReport?decideReport(button):decideDuplicate(button);
 task.then(()=>{busy=false;button.disabled=false;return load();}).catch(error=>{busy=false;button.disabled=false;$('quality-review-status').textContent=error.message;});
});
$('manage')?.addEventListener('click',()=>{if(reviewer)load();});
identify();
