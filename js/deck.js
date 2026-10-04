// Construction des cartes et des propositions de QCM.
import * as progress from "./progress.js";

export const DIRECTIONS = {
  ts: { label: "Terme → sens" },
  st: { label: "Sens → terme" },
};

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

export function cardKey(entry, dir) {
  return `${entry.id}:${dir}`;
}

export function makeCard(entry, dir) {
  return { entry, dir, key: cardKey(entry, dir) };
}

export function prompt(card) {
  return card.dir === "ts" ? card.entry.terme : card.entry.sens;
}

export function answer(card) {
  return card.dir === "ts" ? card.entry.sens : card.entry.terme;
}

// Deux entrées sont "équivalentes" si on ne peut pas les opposer dans un QCM
// sans créer deux bonnes réponses (ex. Macro- et Méga- veulent tous les deux dire "Grand").
export function equivalent(a, b) {
  if (a.id === b.id) return true;
  if (a.syn && a.syn === b.syn) return true;
  return norm(a.sens) === norm(b.sens);
}

export function allCards(entries, cats, dirMode) {
  const dirs = dirMode === "both" ? ["ts", "st"] : [dirMode];
  return entries
    .filter((e) => cats.includes(e.cat))
    .flatMap((e) => dirs.map((d) => makeCard(e, d)));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tirage pondéré sans remise : priorité aux cartes nouvelles et ratées.
function weightedSample(cards, n) {
  const pool = cards.map((c) => ({ c, k: Math.pow(Math.random(), 1 / progress.weight(c.key)) }));
  pool.sort((x, y) => y.k - x.k);
  return pool.slice(0, n).map((x) => x.c);
}

export function buildSession(entries, { cats, dir, length, onlyMistakes }) {
  let cards = allCards(entries, cats, dir);
  if (onlyMistakes) cards = cards.filter((c) => progress.isMistake(c.key));
  const n = length === "all" ? cards.length : Math.min(Number(length), cards.length);
  // Une même entrée ne sort pas dans les deux sens au cours d'une même session courte
  const picked = [];
  const seen = new Set();
  for (const c of weightedSample(cards, cards.length)) {
    if (picked.length >= n) break;
    if (length !== "all" && seen.has(c.entry.id)) continue;
    seen.add(c.entry.id);
    picked.push(c);
  }
  return shuffle(picked);
}

export function choices(card, entries, count = 4) {
  const target = card.entry;
  const isVocab = target.cat === "vocabulaire";
  const ok = (e) => !equivalent(e, target) && (isVocab ? e.cat === "vocabulaire" : e.cat !== "vocabulaire");
  const sameCat = shuffle(entries.filter((e) => e.cat === target.cat && ok(e)));
  const others = shuffle(entries.filter((e) => e.cat !== target.cat && ok(e)));

  const picked = [];
  const texts = new Set([norm(answer(card))]);
  for (const e of [...sameCat, ...others]) {
    if (picked.length >= count - 1) break;
    // pas deux distracteurs équivalents entre eux non plus
    if (picked.some((p) => equivalent(p, e))) continue;
    const text = card.dir === "ts" ? e.sens : e.terme;
    if (texts.has(norm(text))) continue;
    texts.add(norm(text));
    picked.push(e);
  }
  const options = [target, ...picked].map((e) => ({
    text: card.dir === "ts" ? e.sens : e.terme,
    correct: e === target,
  }));
  return shuffle(options);
}

// Autres termes qui ont le même sens (affiché au verso / après réponse)
export function synonyms(entry, entries) {
  // On n'affiche que les vrais synonymes : même groupe ET un mot du sens en commun
  // (-ectasie "Dilatation" est exclu des QCM avec Macro- "Grand", mais ce n'est pas un synonyme).
  const words = (s) => norm(s).split(" ").filter((w) => w.length >= 4);
  const close = (a, b) => words(a.sens).some((w) => norm(b.sens).includes(w));
  return entries.filter(
    (e) =>
      e.id !== entry.id &&
      e.cat !== "vocabulaire" &&
      equivalent(e, entry) &&
      (norm(e.sens) === norm(entry.sens) || close(e, entry) || close(entry, e))
  );
}
