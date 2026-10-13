// Vanamo – Inhalte im Klassenraum melden (Beitrag, Antwort, Diskussionsnachricht, ganzer Raum).
// Die Meldung geht an den Betreiber. Wer gemeldet hat, sieht niemand – auch die Lehrkraft nicht.

export const REASONS=[
 ['illegal','Rechtswidrig','z. B. Gewalt, Hetze, Darstellung von Missbrauch, Urheberrechtsverletzung'],
 ['harassment','Belästigung oder Mobbing',''],
 ['inappropriate','Unpassend für den Unterricht',''],
 ['spam','Spam oder Werbung',''],
 ['other','Etwas anderes',''],
];
const TITLE={post:'Beitrag melden',message:'Nachricht melden',room:'Raum melden'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Meldefenster öffnen. send(payload) schickt die Meldung, onDone() markiert den Knopf. */
export function openReport({kind,id,send,onDone}){
 document.getElementById('cr-report-dialog')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<dialog id="cr-report-dialog" class="cr-report-dialog" aria-labelledby="cr-report-title">
  <div class="dialog-top"><h2 id="cr-report-title">${esc(TITLE[kind]||'Melden')}</h2><button type="button" class="quiet" data-report-close aria-label="Schließen">✕</button></div>
  <form id="cr-report-form" novalidate>
   <fieldset><legend>Was ist das Problem?</legend>
    ${REASONS.map(([value,label,hint])=>`<label class="cr-report-reason"><input type="radio" name="reason" value="${value}"><span><strong>${esc(label)}</strong>${hint?`<small>${esc(hint)}</small>`:''}</span></label>`).join('')}
   </fieldset>
   <label for="cr-report-note">Kurz beschreiben (freiwillig)</label>
   <textarea id="cr-report-note" maxlength="500" rows="3" placeholder="Was ist dir aufgefallen?"></textarea>
   <p class="cr-report-hint">Die Meldung geht an das Vanamo-Team. Wer gemeldet hat, sieht niemand – auch die Lehrkraft nicht. Bist du oder jemand anderes in Gefahr, ruf den Notruf <strong>110</strong> an.</p>
   <button type="submit" class="primary">Melden</button>
  </form>
  <p id="cr-report-status" role="status"></p>
 </dialog>`);
 const d=document.getElementById('cr-report-dialog'),form=d.querySelector('form'),status=d.querySelector('#cr-report-status');
 d.querySelector('[data-report-close]').addEventListener('click',()=>d.close());
 d.addEventListener('close',()=>d.remove());
 form.addEventListener('change',()=>{if(form.querySelector('input[name=reason]:checked'))status.textContent='';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const reason=form.querySelector('input[name=reason]:checked')?.value;
  if(!reason){status.textContent='Bitte wähle einen Grund aus.';return;}
  const button=form.querySelector('button[type=submit]');button.disabled=true;status.textContent='Wird gesendet …';
  try{
   await send({kind,id,reason,note:form.querySelector('textarea').value.trim()});
   form.hidden=true;status.textContent='Danke. Wir schauen uns das an.';onDone?.();
  }catch(err){status.textContent=err?.message||'Das hat nicht geklappt. Bitte versuch es später noch einmal.';button.disabled=false;}
 });
 d.showModal();d.querySelector('input[name=reason]').focus();
 return d;
}
