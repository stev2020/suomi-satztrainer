// Lernstand der Spiele im Konto: { [spiel]: { [deck]: { [wortId]: {box,right,wrong,last} } } }
// Wird mit dem übrigen Lernstand synchronisiert. Beim Zusammenführen gewinnt je Wort
// die zuletzt beantwortete Fassung (größeres `last`).
const KEY = /^[A-Za-z0-9_.:-]{1,80}$/;
const LIMITS = { games: 10, decks: 20, words: 5000 };

function validWord(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const box = Number(p.box), right = Number(p.right), wrong = Number(p.wrong), last = Number(p.last);
  if (![box, right, wrong, last].every(Number.isFinite)) return null;
  if (box < 0 || box > 10 || right < 0 || wrong < 0 || right > 1e6 || wrong > 1e6 || last < 0) return null;
  return { box: Math.round(box), right: Math.round(right), wrong: Math.round(wrong), last: Math.round(last) };
}

/** Prüft und bereinigt; ungültige Einträge werden verworfen statt alles abzulehnen. */
export function validateGames(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [game, decks] of Object.entries(value).slice(0, LIMITS.games)) {
    if (!KEY.test(game) || !decks || typeof decks !== 'object' || Array.isArray(decks)) continue;
    for (const [deck, words] of Object.entries(decks).slice(0, LIMITS.decks)) {
      if (!KEY.test(deck) || !words || typeof words !== 'object' || Array.isArray(words)) continue;
      for (const [id, p] of Object.entries(words).slice(0, LIMITS.words)) {
        const w = KEY.test(id) && validWord(p);
        if (!w) continue;
        ((out[game] ??= {})[deck] ??= {})[id] = w;
      }
    }
  }
  return out;
}

const newer = (a, b) => !b || a.last > b.last || (a.last === b.last && a.right + a.wrong > b.right + b.wrong);

export function mergeGames(a, b) {
  const out = validateGames(a);
  const inc = validateGames(b);
  for (const [game, decks] of Object.entries(inc))
    for (const [deck, words] of Object.entries(decks))
      for (const [id, p] of Object.entries(words)) {
        const target = ((out[game] ??= {})[deck] ??= {});
        if (newer(p, target[id])) target[id] = p;
      }
  return out;
}
