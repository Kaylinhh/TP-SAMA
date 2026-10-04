// Progression stockée dans le navigateur (localStorage), par carte et par sens.
// Système de boîtes à la Leitner : une bonne réponse fait monter la carte d'une boîte,
// une erreur la renvoie en boîte 0. Plus la boîte est basse, plus la carte revient souvent.

const KEY = "revmed:progress:v1";
const SETTINGS_KEY = "revmed:settings:v1";
export const MAX_BOX = 5;
export const MASTERED_BOX = 3;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navigation privée ou stockage plein : on continue sans sauvegarder */
  }
}

let store = read(KEY, {});

export function get(cardKey) {
  return store[cardKey] || null;
}

export function record(cardKey, correct) {
  const p = store[cardKey] || { box: 0, ok: 0, ko: 0 };
  if (correct) {
    p.ok += 1;
    p.box = Math.min(MAX_BOX, p.box + 1);
  } else {
    p.ko += 1;
    p.box = 0;
  }
  p.last = Date.now();
  p.lastOk = correct;
  store[cardKey] = p;
  write(KEY, store);
}

// Poids de tirage : les cartes jamais vues et les cartes ratées sortent plus souvent.
export function weight(cardKey) {
  const p = store[cardKey];
  if (!p) return 6;
  return [10, 6, 4, 2, 1, 1][p.box];
}

export function isMistake(cardKey) {
  const p = store[cardKey];
  return !!p && p.ko > 0 && (p.lastOk === false || p.box < 2);
}

export function isMastered(cardKey) {
  const p = store[cardKey];
  return !!p && p.box >= MASTERED_BOX;
}

export function reset() {
  store = {};
  write(KEY, store);
}

export function loadSettings(defaults) {
  return { ...defaults, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}
