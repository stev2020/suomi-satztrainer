import assert from 'node:assert/strict';
import fs from 'node:fs';
import {goalPercent,ctaLabel,hintText,donateUrl,AMOUNTS,DEFAULT_AMOUNT,MONTH_GOAL} from './dist/support.mjs';

assert.equal(goalPercent(0,10),0);assert.equal(goalPercent(5,10),50);assert.equal(goalPercent(25,10),100,'Balken läuft nicht über');
assert.equal(goalPercent(3,0),0,'ohne Ziel kein Füllstand');assert.equal(goalPercent(-2,10),0);
assert.equal(MONTH_GOAL,10);
assert.deepEqual(Object.keys(AMOUNTS),['einmal','monat','jahr'],'Reihenfolge wie bei Donorbox');
for(const mode of Object.keys(AMOUNTS)){assert.equal(AMOUNTS[mode].length,3,`${mode}: drei Beträge`);assert.equal(AMOUNTS[mode][1],DEFAULT_AMOUNT[mode],`${mode}: der mittlere ist vorausgewählt`);}
assert.equal(ctaLabel('jahr',12),'Mit 12 € im Jahr unterstützen');
assert.equal(ctaLabel('monat',3),'Mit 3 € im Monat unterstützen');
assert.equal(ctaLabel('einmal',5),'Einmalig 5 € geben');
assert.equal(hintText('jahr',12),'12 € im Jahr – das ist 1 € im Monat.');
assert.equal(hintText('jahr',60),'60 € im Jahr – das ist 5 € im Monat.');
assert.equal(hintText('einmal',5),'');
// Donorbox: Betrag und Rhythmus wandern in die Adresse, „Einmalig“ ist die Grundeinstellung des Formulars
assert.equal(donateUrl('','jahr',12),'','ohne Adresse kein Link');
assert.equal(donateUrl('https://donorbox.org/vanamo','jahr',12),'https://donorbox.org/vanamo?amount=12&default_interval=a&language=de');
assert.equal(donateUrl('https://donorbox.org/vanamo','monat',3),'https://donorbox.org/vanamo?amount=3&default_interval=m&language=de');
assert.equal(donateUrl('https://donorbox.org/vanamo','einmal',20),'https://donorbox.org/vanamo?amount=20&language=de');

const read=f=>fs.readFileSync(new URL('./dist/'+f,import.meta.url),'utf8');
const page=read('unterstuetzen.html');
assert(!/\[[A-ZÄÖÜ][A-ZÄÖÜ -]+\]/.test(page),'keine Platzhalter mehr auf der Seite');
for(const f of ['unterstuetzen.html','impressum.html','datenschutz.html'])assert(read(f).includes('mailto:hallo@vanamo.app'),`${f}: Kontaktadresse`);
assert(!read('impressum.html').includes('openlingu'),'alte Adresse entfernt');
for(const f of ['index.html','impressum.html','datenschutz.html'])assert(read(f).includes('href="unterstuetzen.html"'),`${f}: Link zur Seite`);
const sw=read('sw.js');
for(const f of ['./unterstuetzen.html','./support.css?v=2','./support.mjs?v=7'])assert(sw.includes(`'${f}'`),`sw.js: ${f}`);
assert(page.includes('support.css?v=2')&&page.includes('support.mjs?v=7'));
assert(!/ko-fi/i.test(page+read('support.mjs')),'Ko-fi ist raus');
assert(page.includes('keine Spende im steuerlichen Sinn')&&page.includes('Zuwendungsbestätigung'),'Hinweis: keine Spende im steuerlichen Sinn');
assert(/innerhalb von 14 Tagen/.test(page)&&/beenden/.test(page),'Beenden und Erstattung erklärt');
const privacy=read('datenschutz.html');
assert(privacy.includes('id="unterstuetzung"')&&privacy.includes('Donorbox')&&privacy.includes('PayPal'),'Datenschutz nennt Donorbox und PayPal');
assert(!/<script[^>]+donorbox/i.test(page)&&!/frame-src[^;]*donorbox/.test(page),'die Seite lädt nichts von Donorbox');
console.log('Unterstützen: Rechenwege, Donorbox-Link, Hinweis „keine Spende im steuerlichen Sinn“, Datenschutz, Kontaktadresse, Links und Offline-Liste geprüft.');
