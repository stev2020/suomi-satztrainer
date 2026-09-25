// Games-Bereich: Spielauswahl und Start von Mustikka Hyppy (Vokabel-Sprungspiel).
// Das Spiel selbst liegt fertig gebaut unter games/hyppy/ (siehe scripts/update-hyppy.mjs)
// und wird erst beim ersten Start geladen.
import {VERBS} from './verbs-data.mjs';

const $ = id => document.getElementById(id);
const GAME = 'hyppy';
const BASE = 'games/hyppy/';
const DECK_KEY = 'suomi-hyppy-deck';
const GERMAN_PERSONS = ['ich', 'du', 'er/sie', 'wir', 'ihr', 'sie (Plural)'];

/** Verbformen als Wortliste: „ich (wohnen)“ → asun; falsche Planken sind andere Formen desselben Verbs. */
export function verbDeck(verbs = VERBS) {
  const entries = [];
  verbs.forEach((v, index) => {
    const level = Math.min(5, 1 + Math.floor(index / 40));
    v.forms.forEach((form, person) => {
      entries.push({
        id: `${v.id}-${person + 1}`,
        source: `${GERMAN_PERSONS[person]} (${v.de})`,
        target: form,
        lemma: v.id,
        form: `praesens-${person + 1}`,
        category: 'verben',
        level,
        distractors: v.forms.filter((f, i) => i !== person && f !== form),
      });
    });
  });
  return {meta: {title: 'Verbformen', sourceLang: 'de', targetLang: 'fi'}, entries};
}

const DECKS = {
  grund: {title: 'Grundwortschatz', load: async () => (await fetch(BASE + 'words-de-fi.json')).json()},
  verben: {title: 'Verbformen', load: async () => verbDeck()},
};

const accountUser = () => (typeof window.suomiAccountUser === 'function' ? window.suomiAccountUser() : null);
const localKey = deck => `suomi-hyppy.progress.${deck}`;
const readLocal = deck => { try { const v = JSON.parse(localStorage.getItem(localKey(deck))); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** Mit Konto: Lernstand im synchronisierten Lernstand; ohne Konto: nur in diesem Browser. */
function progressStore(deck) {
  const state = window.suomiLearningState;
  if (accountUser() && state?.gameProgress && state?.saveGameProgress) {
    // Was als Gast gespielt wurde, beim ersten Spielen mit Konto übernehmen
    const guest = readLocal(deck);
    if (Object.keys(guest).length) {
      const merged = {...guest};
      for (const [id, p] of Object.entries(state.gameProgress(GAME, deck))) if (!merged[id] || p.last >= merged[id].last) merged[id] = p;
      state.saveGameProgress(GAME, deck, merged);
      try { localStorage.removeItem(localKey(deck)); } catch {}
    }
    return {load: () => state.gameProgress(GAME, deck), save: map => state.saveGameProgress(GAME, deck, map)};
  }
  return {load: () => readLocal(deck), save: map => { try { localStorage.setItem(localKey(deck), JSON.stringify(map)); } catch {} }};
}

function knownCount(deck) {
  const map = accountUser() && window.suomiLearningState?.gameProgress ? window.suomiLearningState.gameProgress(GAME, deck) : readLocal(deck);
  return Object.values(map).filter(p => p.box >= 3).length;
}

let deck = 'grund', instance = null, opening = false;
try { if (DECKS[localStorage.getItem(DECK_KEY)]) deck = localStorage.getItem(DECK_KEY); } catch {}

function renderCard() {
  document.querySelectorAll('[data-hyppy-deck]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hyppyDeck === deck)));
  const n = knownCount(deck);
  const where = accountUser() ? 'in deinem Konto' : 'nur in diesem Browser – mit Konto wird er gespeichert';
  $('hyppy-progress').textContent = n ? `${n} Wörter sicher · Lernstand ${where}.` : `Lernstand ${where}.`;
}

function closeGame(fromHistory = false) {
  if (!instance && !opening) return;
  opening = false;
  try { instance?.destroy(); } catch {}
  instance = null;
  $('game-stage').replaceChildren();
  $('game-overlay').hidden = true;
  document.body.classList.remove('game-open');
  if (!fromHistory && history.state?.suomiGame) history.back();
  renderCard();
  $('hyppy-start').focus();
}

async function openGame() {
  if (instance || opening) return;
  opening = true;
  const start = $('hyppy-start');
  start.disabled = true;
  $('game-overlay').hidden = false;
  document.body.classList.add('game-open');
  $('game-loading').hidden = false;
  history.pushState({...(history.state || {}), suomiGame: true}, '');
  try {
    const [{createMustikkaHyppy}, words] = await Promise.all([import('./' + BASE + 'mustikka-hyppy.js'), DECKS[deck].load()]);
    if (!opening) return; // inzwischen geschlossen
    $('game-loading').hidden = true;
    instance = createMustikkaHyppy({
      parent: $('game-stage'),
      words,
      settings: {assetBaseUrl: BASE, allowImport: false, storagePrefix: 'suomi-hyppy', direction: 'forward'},
      progressStore: progressStore(deck),
      onExit: () => closeGame(),
    });
  } catch (error) {
    console.error('[Games] Spiel konnte nicht geladen werden', error);
    $('game-loading').textContent = 'Das Spiel konnte nicht geladen werden. Bitte prüfe die Internetverbindung.';
    setTimeout(() => closeGame(), 2500);
  } finally {
    opening = false;
    start.disabled = false;
  }
}

function bind() {
  if (typeof document === 'undefined' || !$('games-view')) return;
  document.querySelectorAll('[data-hyppy-deck]').forEach(b => b.addEventListener('click', () => {
    deck = b.dataset.hyppyDeck;
    try { localStorage.setItem(DECK_KEY, deck); } catch {}
    renderCard();
  }));
  $('hyppy-start').addEventListener('click', openGame);
  window.addEventListener('popstate', () => { if ($('game-overlay') && !$('game-overlay').hidden) closeGame(true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('game-overlay').hidden && instance?.game?.scene?.isActive('Menu')) closeGame(); });
  $('games-nav')?.addEventListener('click', renderCard);
  renderCard();
}

bind();
