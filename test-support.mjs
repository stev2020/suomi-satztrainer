import assert from 'node:assert/strict';
import fs from 'node:fs';
import {goalPercent,ctaLabel,hintText,AMOUNTS,DEFAULT_AMOUNT,MONTH_GOAL} from './dist/support.mjs';

assert.equal(goalPercent(0,10),0);assert.equal(goalPercent(5,10),50);assert.equal(goalPercent(25,10),100,'Balken läuft nicht über');
assert.equal(goalPercent(3,0),0,'ohne Ziel kein Füllstand');assert.equal(goalPercent(-2,10),0);
assert.equal(MONTH_GOAL,10);
for(const mode of Object.keys(AMOUNTS))assert(AMOUNTS[mode].includes(DEFAULT_AMOUNT[mode]),`${mode}: Vorauswahl ist ein angebotener Betrag`);
assert.equal(ctaLabel('jahr',12),'Mit 12 € im Jahr unterstützen');
assert.equal(ctaLabel('monat',3),'Mit 3 € im Monat unterstützen');
assert.equal(ctaLabel('einmal',5),'Einmalig 5 € geben');
assert.equal(hintText('jahr',12),'12 € im Jahr – das ist 1 € im Monat.');
assert.equal(hintText('jahr',60),'60 € im Jahr – das ist 5 € im Monat.');
assert.equal(hintText('einmal',5),'');

const read=f=>fs.readFileSync(new URL('./dist/'+f,import.meta.url),'utf8');
const page=read('unterstuetzen.html');
assert(!/\[[A-ZÄÖÜ][A-ZÄÖÜ -]+\]/.test(page),'keine Platzhalter mehr auf der Seite');
for(const f of ['unterstuetzen.html','impressum.html','datenschutz.html'])assert(read(f).includes('mailto:hallo@vanamo.app'),`${f}: Kontaktadresse`);
assert(!read('impressum.html').includes('openlingu'),'alte Adresse entfernt');
for(const f of ['index.html','impressum.html','datenschutz.html'])assert(read(f).includes('href="unterstuetzen.html"'),`${f}: Link zur Seite`);
const sw=read('sw.js');
for(const f of ['./unterstuetzen.html','./support.css?v=1','./support.mjs?v=1'])assert(sw.includes(`'${f}'`),`sw.js: ${f}`);
assert(page.includes('support.css?v=1')&&page.includes('support.mjs?v=1'));
console.log('Unterstützen: Rechenwege, Texte, Kontaktadresse, Links und Offline-Liste geprüft.');
