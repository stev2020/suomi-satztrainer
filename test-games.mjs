// Games: Verb-Wortliste für Mustikka Hyppy und Zusammenführen des Spiel-Lernstands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verbDeck} from './dist/games.mjs';
import {VERBS} from './dist/verbs-data.mjs';
import {validateGames,mergeGames} from './dist/games-progress.mjs';

const deck=verbDeck();
assert.equal(deck.entries.length,VERBS.length*6,'six present forms per verb');
assert.equal(new Set(deck.entries.map(e=>e.id)).size,deck.entries.length,'unique ids');
const asun=deck.entries.find(e=>e.id==='asua-1');
assert.deepEqual({source:asun.source,target:asun.target},{source:'ich (wohnen)',target:'asun'});
assert.deepEqual(asun.distractors,['asut','asuu','asumme','asutte','asuvat'],'wrong planks are other forms of the same verb');
for(const e of deck.entries){assert(!e.distractors.includes(e.target));assert(e.level>=1&&e.level<=5);assert(e.target.length<=24,e.target);}

const words=JSON.parse(fs.readFileSync(new URL('./dist/games/hyppy/words-de-fi.json',import.meta.url)));
assert(words.entries.length>=600,'bundled word list');
for(const f of ['mustikka-hyppy.js','cover.png','fonts/patrick-hand.woff2','bg/paper_tile.png','character/berry_idle.png','platforms/plank_word.png','LICENSES.txt'])
  assert(fs.existsSync(new URL('./dist/games/hyppy/'+f,import.meta.url)),f);

assert.deepEqual(validateGames({hyppy:{grund:{ok:{box:2,right:3,wrong:1,last:5},bad:{box:'x'},'<script>':{box:1,right:1,wrong:0,last:1}}},'bad key!':{}}),{hyppy:{grund:{ok:{box:2,right:3,wrong:1,last:5}}}},'invalid entries are dropped, not the whole state');
const m=mergeGames({hyppy:{grund:{a:{box:3,right:3,wrong:0,last:10}}}},{hyppy:{grund:{a:{box:0,right:3,wrong:1,last:20},b:{box:1,right:1,wrong:0,last:5}}}});
assert.equal(m.hyppy.grund.a.box,0,'newer answer wins, even when it lowers the box');
assert.ok(m.hyppy.grund.b);
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert(html.includes('id="games-nav"')&&html.includes('data-view="games"'),'header button');
console.log('PASS: verb deck, bundled game files, game progress validation/merge and Games header button.');
