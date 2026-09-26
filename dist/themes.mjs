// Vanamo – Farbpaletten.
//
// Die Farben selbst stehen in style.css (:root und :root[data-theme=…]). Hier wird nur gewählt,
// gespeichert und die Auswahl im Fuß der Seite angezeigt. Ohne gespeicherte Wahl richtet sich die
// Palette nach dem Gerät: dunkler Modus → Kaamos, sonst Vanamo. Das kleine Skript im <head> von
// index.html setzt die Palette schon vor dem ersten Zeichnen, damit nichts aufblitzt.

export const THEMES=[
 {id:'vanamo',name:'Vanamo',hint:'Waldblume',dark:false,color:'#65478b'},
 {id:'mustikka',name:'Mustikka',hint:'Heidelbeere',dark:false,color:'#3e4a8c'},
 {id:'ruska',name:'Ruska',hint:'Herbstlaub',dark:false,color:'#b4532a'},
 {id:'kaamos',name:'Kaamos',hint:'Polarnacht',dark:true,color:'#1f2b4d'},
 {id:'revontulet',name:'Revontulet',hint:'Nordlicht',dark:true,color:'#2bb38a'},
];
export const STORAGE_KEY='vanamo-theme';
const DEFAULT_LIGHT='vanamo',DEFAULT_DARK='kaamos';
const byId=id=>THEMES.find(t=>t.id===id);
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;

function saved(){try{const id=localStorage.getItem(STORAGE_KEY);return byId(id)?id:null;}catch{return null;}}
const systemTheme=()=>media?.matches?DEFAULT_DARK:DEFAULT_LIGHT;

/** Aktuelle Palette (gespeicherte Wahl oder Gerätevorgabe). */
export function currentTheme(){return byId(document.documentElement.dataset.theme)||byId(saved()||systemTheme());}

function apply(id){
 const theme=byId(id)||byId(DEFAULT_LIGHT);
 const root=document.documentElement;
 root.dataset.theme=theme.id;
 root.dataset.themeMode=theme.dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=getComputedStyle(root).getPropertyValue('--bg').trim();
 document.querySelectorAll('[data-theme-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeId===theme.id)));
 document.dispatchEvent(new CustomEvent('vanamo-theme',{detail:{id:theme.id,dark:theme.dark}}));
}

/** Palette wählen und merken. */
export function setTheme(id){
 if(!byId(id))return;
 try{localStorage.setItem(STORAGE_KEY,id);}catch{}
 apply(id);
}

function mount(){
 document.querySelectorAll('[data-ui-theme]').forEach(box=>{
  box.replaceChildren(...THEMES.map(t=>{
   const b=document.createElement('button');
   b.type='button';
   b.className='theme-swatch';
   b.dataset.themeId=t.id;
   const label=`${t.name} – ${t.hint}`;
   b.title=label;
   b.setAttribute('aria-label',label);
   b.style.setProperty('--swatch',t.color);
   b.onclick=()=>setTheme(t.id);
   return b;
  }));
 });
 apply(currentTheme().id);
}

if(typeof document!=='undefined'){
 mount();
 // Folgt dem Gerät, solange niemand selbst eine Palette gewählt hat.
 media?.addEventListener?.('change',()=>{if(!saved())apply(systemTheme());});
 // Wahl in einem anderen Tab übernehmen.
 addEventListener('storage',e=>{if(e.key===STORAGE_KEY)apply(saved()||systemTheme());});
}
