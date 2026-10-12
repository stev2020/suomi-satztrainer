import assert from 'node:assert/strict';
import {finnishGreeting,displayName,weekActivity,practiceStreak,dayKey,chooseDaily,DAILY_RECENT} from './dist/home-extras.mjs';
import {initialHomeTab,HOME_TABS} from './dist/home-tabs.mjs';

const at=(y,m,d,h)=>new Date(y,m-1,d,h,15);
// 2026-09-28 ist ein Montag.
assert.equal(finnishGreeting(at(2026,9,29,7)).fi,'Hyvää huomenta');
assert.equal(finnishGreeting(at(2026,9,28,8)).fi,'Hyvää alkavaa viikkoa','Montagmorgen');
assert.equal(finnishGreeting(at(2026,9,29,13)).fi,'Hyvää päivää');
assert.equal(finnishGreeting(at(2026,10,3,13)).fi,'Hyvää viikonloppua','Samstag tagsüber');
assert.equal(finnishGreeting(at(2026,10,2,18)).fi,'Hyvää perjantaita','Freitagabend');
assert.equal(finnishGreeting(at(2026,9,29,19)).fi,'Hyvää iltaa');
assert.equal(finnishGreeting(at(2026,9,29,23)).fi,'Moi, yökyöpeli');
assert.equal(finnishGreeting(at(2026,9,29,3)).de,'Hallo, Nachteule');
assert.equal(displayName('stefan'),'Stefan');assert.equal(displayName(''),'');assert.equal(displayName('äijä'),'Äijä');

const tue=at(2026,9,29,9),k=(y,m,d)=>dayKey(new Date(y,m-1,d,12));
const daily={[k(2026,9,29)]:4,[k(2026,9,28)]:10,[k(2026,9,27)]:1,[k(2026,9,25)]:3};
assert.equal(practiceStreak(daily,tue),3,'heute, gestern, vorgestern');
assert.equal(practiceStreak({[k(2026,9,28)]:5,[k(2026,9,27)]:5},tue),2,'noch nicht geübt heute bricht die Serie nicht');
assert.equal(practiceStreak({[k(2026,9,27)]:5},tue),0,'Lücke gestern beendet die Serie');
assert.equal(practiceStreak({},tue),0);

const week=weekActivity(daily,tue);
assert.deepEqual(week.map(d=>d.short),['Mo','Di','Mi','Do','Fr','Sa','So']);
assert.equal(week[0].key,k(2026,9,28));assert.equal(week[6].key,k(2026,10,4));
assert.deepEqual(week.map(d=>d.count),[10,4,0,0,0,0,0]);
assert.ok(week[1].today&&!week[0].today);assert.ok(week[2].future&&!week[1].future);
assert.equal(weekActivity({},at(2026,10,4,22))[6].today,true,'Sonntag gehört zur laufenden Woche');

// Reiter der Startseite: Womit geht sie auf?
assert.deepEqual(HOME_TABS,['welcome','practice','new','grammar']);
assert.equal(initialHomeTab({sessionTab:'grammar',lastDay:'2026-10-06',day:'2026-10-06'}),'grammar','auch der Reiter „Grammatik“ bleibt');
assert.equal(initialHomeTab({lastDay:'',day:'2026-10-06'}),'welcome','erstes Öffnen überhaupt');
assert.equal(initialHomeTab({lastDay:'2026-10-05',day:'2026-10-06'}),'welcome','erstes Öffnen am Tag');
assert.equal(initialHomeTab({lastDay:'2026-10-06',day:'2026-10-06'}),'practice','später am selben Tag direkt „Üben“');
assert.equal(initialHomeTab({sessionTab:'new',lastDay:'2026-10-05',day:'2026-10-06'}),'new','in diesem Browser-Tab gewählter Reiter bleibt');
assert.equal(initialHomeTab({sessionTab:'quatsch',lastDay:'2026-10-06',day:'2026-10-06'}),'practice','unbekannter Wert zählt nicht');
assert.equal(initialHomeTab({intro:true,sessionTab:'practice',lastDay:'2026-10-06',day:'2026-10-06'}),'welcome','mit Intro immer „Willkommen“');
// Satz des Tages: läuft der Reihe nach durch, ohne baldige Wiederholung.
{
 const pool=Array.from({length:23},(_,i)=>({id:1000+i*7})),user='0c3952f6-c4a3-4705-a049-3d40c72c6da3';
 const days=Array.from({length:23},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10));
 const shown=[];
 for(const day of days)shown.push(chooseDaily(pool,user,day,[...shown].reverse()).id);
 assert.equal(new Set(shown).size,23,'23 Tage, 23 verschiedene Sätze');
 assert.equal(chooseDaily(pool,user,days[3]).id,chooseDaily([...pool].reverse(),user,days[3]).id,'Reihenfolge im Vorrat egal (gleich auf allen Geräten)');
 // Neuer Satz kommt dazu: die zuletzt gezeigten bleiben trotzdem außen vor.
 const grown=[...pool,{id:5}],recent=[...shown].reverse().slice(0,DAILY_RECENT);
 assert.ok(!recent.includes(chooseDaily(grown,user,'2026-10-24',recent).id));
 assert.equal(chooseDaily([{id:1}],user,'2026-10-24',[1]).id,1,'nur ein Satz: der kommt eben wieder');
 assert.equal(chooseDaily([],user,'2026-10-24'),null);
 // Ohne Verlauf (anderes Gerät) kommen an aufeinanderfolgenden Tagen trotzdem verschiedene Sätze.
 for(let i=1;i<days.length;i++)assert.notEqual(chooseDaily(pool,user,days[i]).id,chooseDaily(pool,user,days[i-1]).id);
}
console.log('Startseite: Begrüßung nach Tageszeit, Name, Serie, Wochenreihe und Start-Reiter geprüft.');
