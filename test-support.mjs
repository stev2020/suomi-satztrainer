import assert from 'node:assert/strict';
import fs from 'node:fs';
import {goalPercent,ctaLabel,hintText,donateUrl,AMOUNTS,DEFAULT_AMOUNT,MONTH_GOAL,pendingValid,swarmListText,thanksText,PENDING_DAYS} from './dist/support.mjs';
import {cleanName,shownNames,dotCount,DOTS_WIDE,DOTS_NARROW} from './dist/support-swarm.mjs';

assert.equal(goalPercent(0,10),0);assert.equal(goalPercent(5,10),50);assert.equal(goalPercent(25,10),100,'Balken läuft nicht über');
assert.equal(goalPercent(3,0),0,'ohne Ziel kein Füllstand');assert.equal(goalPercent(-2,10),0);
assert.equal(MONTH_GOAL,10);
assert.deepEqual(Object.keys(AMOUNTS),['einmal','monat','jahr'],'Reihenfolge wie bei Donorbox');
for(const mode of Object.keys(AMOUNTS)){assert.equal(AMOUNTS[mode].length,3,`${mode}: drei Beträge`);assert.equal(AMOUNTS[mode][1],DEFAULT_AMOUNT[mode],`${mode}: der mittlere ist vorausgewählt`);}
assert.equal(ctaLabel('jahr',12),'Mit 12 € im Jahr unterstützen');
assert.equal(ctaLabel('monat',3),'Mit 3 € im Monat unterstützen');
assert.equal(ctaLabel('einmal',5),'Einmalig 5 € geben');
assert.equal(hintText('jahr',12),'','keine Umrechnung in Monate');
assert.equal(hintText('einmal',5),'');
// Donorbox: Betrag und Rhythmus wandern in die Adresse, „Einmalig“ ist die Grundeinstellung des Formulars
assert.equal(donateUrl('','jahr',12),'','ohne Adresse kein Link');
assert.equal(donateUrl('https://donorbox.org/vanamo','jahr',12),'https://donorbox.org/vanamo?amount=12&default_interval=a&language=de');
assert.equal(donateUrl('https://donorbox.org/vanamo','monat',3),'https://donorbox.org/vanamo?amount=3&default_interval=m&language=de');
assert.equal(donateUrl('https://donorbox.org/vanamo','einmal',20),'https://donorbox.org/vanamo?amount=20&language=de');

// Schwarm: Vornamen prüfen, neueste Namen zeigen, feste Punktzahl, Frist für vorgemerkte Namen
assert.equal(cleanName('  Marja-Liisa '),'Marja-Liisa');assert.equal(cleanName('Jöns'),'Jöns');assert.equal(cleanName("D'Arcy"),"D'Arcy");
assert.equal(cleanName('Anna  Lena'),'Anna Lena','Leerzeichen zusammengefasst');
for(const bad of ['A','Anna1','<b>x</b>','Anna--Lena','-Anna','x'.repeat(21),'','  '])assert.equal(cleanName(bad),null,bad);
const list=Array.from({length:80},(_,i)=>({name:'N'+i}));
assert.deepEqual(shownNames(list,70).shown.map(n=>n.name),list.slice(10).map(n=>n.name),'die neuesten 70');
assert.equal(shownNames(list,70).older,10);assert.equal(shownNames([],70).older,0);
assert.equal(dotCount(1000),DOTS_WIDE);assert.equal(dotCount(390),DOTS_NARROW);assert.equal(dotCount(1000,5),DOTS_WIDE+5,'frühere Unterstützer fliegen als Punkte mit');assert.equal(dotCount(1000,999),DOTS_WIDE+200,'gedeckelt');
const tok='a'.repeat(64),now=Date.now();
assert(pendingValid({token:tok,name:'Anna',at:now-1000},now));
assert(!pendingValid({token:tok,name:'Anna',at:now-PENDING_DAYS*86400000-1},now),'nach drei Tagen verfallen');
assert(!pendingValid({token:'xyz',name:'Anna',at:now},now));assert(!pendingValid({token:tok,name:'A1',at:now},now));assert(!pendingValid(null));
assert.equal(swarmListText([],0),'Im Schwarm ist noch kein Name.');
assert.equal(swarmListText([{name:'Anna'},{name:'Mikko'}],2),'Im Schwarm: Anna, Mikko. Dazu 2 frühere Unterstützungen.');
assert.equal(thanksText('Anna'),'Danke, Anna! Dein Name fliegt jetzt im Schwarm mit.');assert.equal(thanksText(''),'Danke für deine Unterstützung!');
assert(read('datenschutz.html').includes('id="schwarm"')&&/sechs Monate/.test(read('datenschutz.html'))&&/Art\. 6 Abs\. 1 lit\. a/.test(read('datenschutz.html')),'Datenschutz: Schwarm, sechs Monate, Einwilligung');

function read(f){return fs.readFileSync(new URL('./dist/'+f,import.meta.url),'utf8');}
const page=read('unterstuetzen.html');
assert(!/\[[A-ZÄÖÜ][A-ZÄÖÜ -]+\]/.test(page),'keine Platzhalter mehr auf der Seite');
for(const f of ['unterstuetzen.html','impressum.html','datenschutz.html'])assert(read(f).includes('mailto:hallo@vanamo.app'),`${f}: Kontaktadresse`);
assert(!read('impressum.html').includes('openlingu'),'alte Adresse entfernt');
for(const f of ['index.html','impressum.html','datenschutz.html'])assert(read(f).includes('href="unterstuetzen.html"'),`${f}: Link zur Seite`);
const sw=read('sw.js');
for(const f of ['./unterstuetzen.html','./support.css?v=3','./support.mjs?v=10','./support-swarm.mjs?v=2'])assert(sw.includes(`'${f}'`),`sw.js: ${f}`);
assert(page.includes('support.css?v=3')&&page.includes('support.mjs?v=10'));
assert(read('support.mjs').includes("support-swarm.mjs?v=2"));
assert(!/ko-fi/i.test(page+read('support.mjs')),'Ko-fi ist raus');
assert(page.includes('keine Spende im steuerlichen Sinn')&&page.includes('Zuwendungsbestätigung'),'Hinweis: keine Spende im steuerlichen Sinn');
assert(/innerhalb von 14 Tagen/.test(page)&&/beenden/.test(page),'Beenden und Erstattung erklärt');
const privacy=read('datenschutz.html');
assert(privacy.includes('id="unterstuetzung"')&&privacy.includes('Donorbox')&&privacy.includes('PayPal'),'Datenschutz nennt Donorbox und PayPal');
assert(!/<script[^>]+donorbox/i.test(page)&&!/frame-src[^;]*donorbox/.test(page),'die Seite lädt nichts von Donorbox');
console.log('Unterstützen: Rechenwege, Donorbox-Link, Hinweis „keine Spende im steuerlichen Sinn“, Datenschutz, Schwarm, Kontaktadresse, Links und Offline-Liste geprüft.');
