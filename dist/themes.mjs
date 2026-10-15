// Vanamo – Farbpaletten und Tag/Nacht.
//
// Die Farben selbst stehen in style.css (:root und :root[data-theme=…]). Hier wird nur gewählt,
// gespeichert und die Auswahl im Fuß der Seite angezeigt. Kaamos ist die Nacht: Der Sonnen-Knopf im
// Kopf der Seite (sky.mjs) wechselt zwischen der zuletzt gewählten hellen Palette und Kaamos.
// Ohne gespeicherte Wahl richtet sich die Palette nach Gerät und Uhrzeit: dunkler Modus oder
// zwischen 21 und 6 Uhr → Kaamos, sonst Vanamo. Das kleine Skript im <head> der Seiten setzt die
// Palette schon vor dem ersten Zeichnen, damit nichts aufblitzt (gleiche Regel).

export const THEMES=[
 {id:'vanamo',name:'Vanamo',hint:'Waldblume',dark:false,color:'#65478b'},
 {id:'ruska',name:'Ruska',hint:'Herbstlaub',dark:false,color:'#b4532a'},
 {id:'tunturi',name:'Tunturi',hint:'Fjell',dark:false,color:'#589099'},
 {id:'kaamos',name:'Kaamos',hint:'Polarnacht',dark:true,color:'#1f2b4d'},
];
export const STORAGE_KEY='vanamo-theme';
const DAY_KEY='vanamo-theme-day'; // zuletzt gewählte helle Palette (für den Sonnen-Knopf)
const DEFAULT_LIGHT='vanamo',DEFAULT_DARK='kaamos';
// Frühere Paletten, die es nicht mehr gibt
const RETIRED={mustikka:'vanamo',revontulet:'kaamos'};
const byId=id=>THEMES.find(t=>t.id===id);
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;

function read(key){try{return localStorage.getItem(key);}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,value);}catch{}}
function saved(){
 let id=read(STORAGE_KEY);
 if(RETIRED[id]){id=RETIRED[id];write(STORAGE_KEY,id);}
 return byId(id)?id:null;
}
export const isNightHour=(date=new Date())=>{const h=date.getHours();return h>=21||h<6;};
const systemTheme=()=>media?.matches||isNightHour()?DEFAULT_DARK:DEFAULT_LIGHT;
const dayTheme=()=>{const id=read(DAY_KEY);return byId(id)&&!byId(id).dark?id:DEFAULT_LIGHT;};

/** Aktuelle Palette (gespeicherte Wahl oder Vorgabe nach Gerät und Uhrzeit). */
export function currentTheme(){return byId(document.documentElement.dataset.theme)||byId(saved()||systemTheme());}
export const isNight=()=>!!currentTheme()?.dark;

function apply(id){
 const theme=byId(id)||byId(DEFAULT_LIGHT);
 const root=document.documentElement;
 const changed=root.dataset.theme!==theme.id;
 root.dataset.theme=theme.id;
 root.dataset.themeMode=theme.dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=getComputedStyle(root).getPropertyValue('--bg').trim();
 document.querySelectorAll('[data-theme-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeId===theme.id)));
 if(changed)document.dispatchEvent(new CustomEvent('vanamo-theme',{detail:{id:theme.id,dark:theme.dark}}));
}

/** Palette wählen und merken. */
export function setTheme(id){
 const theme=byId(id);if(!theme)return;
 write(STORAGE_KEY,id);
 if(!theme.dark)write(DAY_KEY,id);
 apply(id);
}

/** Tag ↔ Nacht: Nacht ist Kaamos, Tag die zuletzt gewählte helle Palette. */
export function setNight(night){setTheme(night?DEFAULT_DARK:dayTheme());}

function mount(){
 saved(); // alte Palette im Speicher gleich umstellen
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
   // Über den Himmel (sky.mjs) wechseln, damit Tag/Nacht auch dort weich übergeht
   b.onclick=()=>document.dispatchEvent(new CustomEvent('vanamo-theme-request',{detail:{id:t.id},cancelable:true}))&&setTheme(t.id);
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
