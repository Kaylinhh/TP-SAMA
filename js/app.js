import * as progress from "./progress.js";
import * as deck from "./deck.js";

const app = document.getElementById("app");

const DEFAULTS = { cats: ["prefixe", "racine", "suffixe"], mode: "qcm", dir: "both", length: "20", onlyMistakes: false };
let settings = progress.loadSettings(DEFAULTS);
let data = null;
let session = null;
let keyHandler = null;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const catLabel = (id) => data.categories.find((c) => c.id === id)?.label ?? id;

function setKeys(handler) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = handler;
  if (handler) document.addEventListener("keydown", handler);
}

function focusMain() {
  const el = app.querySelector("[data-autofocus]");
  if (el) el.focus({ preventScroll: true });
}

/* ---------- Accueil ---------- */

function renderHome() {
  setKeys(null);
  session = null;
  const { entries, categories } = data;

  const stats = categories.map((c) => {
    const cards = deck.allCards(entries, [c.id], "both");
    const mastered = cards.filter((k) => progress.isMastered(k.key)).length;
    return { ...c, total: cards.length, mastered, count: entries.filter((e) => e.cat === c.id).length };
  });

  const mistakes = deck.allCards(entries, settings.cats, settings.dir).filter((c) => progress.isMistake(c.key)).length;
  if (mistakes === 0 && settings.onlyMistakes) settings.onlyMistakes = false;

  const seg = (name, value, label) => `
    <label class="seg-item">
      <input type="radio" name="${name}" value="${value}" ${settings[name] === value ? "checked" : ""}>
      <span>${label}</span>
    </label>`;

  app.innerHTML = `
    <header class="home-head">
      <p class="eyebrow">SAMA · Terminologie médicale</p>
      <h1>Réviser les termes médicaux</h1>
    </header>

    <form id="setup" class="setup">
      <fieldset>
        <legend>Quoi réviser</legend>
        <div class="chips">
          ${stats
            .map(
              (c) => `
            <label class="chip">
              <input type="checkbox" name="cats" value="${c.id}" ${settings.cats.includes(c.id) ? "checked" : ""}>
              <span class="chip-body">
                <span class="chip-title">${esc(c.label)}</span>
                <span class="chip-meta">${c.count} termes</span>
                <span class="bar" aria-hidden="true"><span style="width:${(c.mastered / c.total) * 100}%"></span></span>
                <span class="chip-meta">${Math.round((c.mastered / c.total) * 100)} % maîtrisé</span>
              </span>
            </label>`
            )
            .join("")}
        </div>
      </fieldset>

      <fieldset>
        <legend>Mode</legend>
        <div class="seg">${seg("mode", "qcm", "QCM")}${seg("mode", "flash", "Flashcards")}</div>
      </fieldset>

      <fieldset>
        <legend>Sens</legend>
        <div class="seg">${seg("dir", "ts", "Terme → sens")}${seg("dir", "st", "Sens → terme")}${seg("dir", "both", "Les deux")}</div>
      </fieldset>

      <fieldset>
        <legend>Nombre de questions</legend>
        <div class="seg">${seg("length", "10", "10")}${seg("length", "20", "20")}${seg("length", "all", "Tout")}</div>
      </fieldset>

      <label class="toggle ${mistakes === 0 ? "is-disabled" : ""}">
        <input type="checkbox" name="onlyMistakes" ${settings.onlyMistakes ? "checked" : ""} ${mistakes === 0 ? "disabled" : ""}>
        <span>Seulement ce que j'ai raté <strong>${mistakes}</strong></span>
      </label>

      <p class="form-error" id="err" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-big" data-autofocus>Commencer</button>
    </form>

    <footer class="home-foot">
      <p>Ta progression reste sur cet appareil, dans ce navigateur.</p>
      <button type="button" class="link" id="reset">Remettre la progression à zéro</button>
    </footer>`;

  const form = app.querySelector("#setup");
  const sync = () => {
    const fd = new FormData(form);
    settings = {
      cats: fd.getAll("cats"),
      mode: fd.get("mode"),
      dir: fd.get("dir"),
      length: fd.get("length"),
      onlyMistakes: fd.get("onlyMistakes") === "on",
    };
    progress.saveSettings(settings);
  };

  form.addEventListener("change", (e) => {
    sync();
    // le compteur d'erreurs dépend des catégories et du sens choisis
    if (e.target.name === "cats" || e.target.name === "dir") renderHome();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sync();
    const err = app.querySelector("#err");
    if (!settings.cats.length) {
      err.textContent = "Choisis au moins une catégorie.";
      return;
    }
    const cards = deck.buildSession(data.entries, settings);
    if (!cards.length) {
      err.textContent = "Rien à réviser avec ces réglages.";
      return;
    }
    startSession(cards);
  });

  app.querySelector("#reset").addEventListener("click", () => {
    if (confirm("Effacer toute ta progression sur cet appareil ?")) {
      progress.reset();
      renderHome();
    }
  });
}

/* ---------- Session ---------- */

function startSession(cards) {
  session = {
    queue: cards.slice(),
    total: cards.length,
    done: 0,
    firstTry: new Map(), // key -> bonne réponse du premier coup ?
    retried: new Set(),
    mode: settings.mode,
  };
  next();
}

function next() {
  if (!session.queue.length) return renderResults();
  session.card = session.queue.shift();
  session.isRetry = session.firstTry.has(session.card.key);
  session.answered = false;
  session.flipped = false;
  if (session.mode === "qcm") {
    session.options = deck.choices(session.card, data.entries);
    renderQcm();
  } else {
    renderFlash();
  }
}

function answerCard(correct) {
  const { card } = session;
  const isRetry = session.firstTry.has(card.key);
  if (!isRetry) {
    session.firstTry.set(card.key, correct);
    session.done += 1;
    progress.record(card.key, correct);
  }
  // une carte ratée revient une fois un peu plus loin dans la session
  if (!correct && !session.retried.has(card.key)) {
    session.retried.add(card.key);
    const pos = Math.min(session.queue.length, 3 + Math.floor(Math.random() * 3));
    session.queue.splice(pos, 0, card);
  }
}

function topBar() {
  const pct = (session.done / session.total) * 100;
  const retry = session.isRetry;
  return `
    <div class="topbar">
      <button type="button" class="icon-btn" id="quit" aria-label="Quitter la session">✕</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${session.total}" aria-valuenow="${session.done}">
        <span style="width:${pct}%"></span>
      </div>
      <span class="count">${session.done}/${session.total}</span>
    </div>
    <p class="card-meta">
      <span class="tag tag-${session.card.entry.cat}">${esc(catLabel(session.card.entry.cat))}</span>
      <span>${session.card.dir === "ts" ? "Que veut dire…" : "Quel terme veut dire…"}</span>
      ${retry ? '<span class="tag tag-retry">On y revient</span>' : ""}
    </p>`;
}

function bindQuit() {
  app.querySelector("#quit").addEventListener("click", () => {
    if (session.done === 0 || confirm("Quitter la session ? Tes réponses sont déjà enregistrées.")) renderHome();
  });
}

function details(entry, dir) {
  const syn = deck.synonyms(entry, data.entries);
  const ex = entry.exemples.filter((x) => x.mot);
  return `
    <div class="details">
      ${
        syn.length
          ? `<p class="syn">Sens proche : ${syn.map((s) => `<strong>${esc(s.terme)}</strong>`).join(", ")}</p>`
          : ""
      }
      ${
        ex.length
          ? `<ul class="examples">${ex
              .map((x) => `<li><strong>${esc(x.mot)}</strong>${x.def ? ` : ${esc(x.def)}` : ""}</li>`)
              .join("")}</ul>`
          : ""
      }
    </div>`;
}

function promptClass(card) {
  // les définitions longues (vocabulaire, sens → terme) s'affichent plus petit
  return deck.prompt(card).length > 60 ? "prompt prompt-long" : "prompt";
}

/* QCM */

function renderQcm() {
  const { card, options, answered } = session;
  app.innerHTML = `
    ${topBar()}
    <section class="question">
      <h2 class="${promptClass(card)}">${esc(deck.prompt(card))}</h2>
      <div class="options" role="group" aria-label="Réponses possibles">
        ${options
          .map((o, i) => {
            let cls = "option";
            if (answered) {
              if (o.correct) cls += " is-correct";
              else if (i === session.picked) cls += " is-wrong";
              else cls += " is-dim";
            }
            return `<button type="button" class="${cls}" data-i="${i}" ${answered ? "disabled" : ""} ${i === 0 && !answered ? "data-autofocus" : ""}>
              <span class="key" aria-hidden="true">${i + 1}</span><span class="opt-text">${esc(o.text)}</span>
            </button>`;
          })
          .join("")}
      </div>
      ${
        answered
          ? `<div class="feedback ${session.lastCorrect ? "ok" : "ko"}">
              <p class="verdict">${session.lastCorrect ? "Bonne réponse" : `Réponse : <strong>${esc(deck.answer(card))}</strong>`}</p>
              ${card.dir === "st" || card.entry.cat !== "vocabulaire" ? details(card.entry, card.dir) : ""}
            </div>
            <button type="button" class="btn btn-primary btn-big" id="next" data-autofocus>Suivant</button>`
          : ""
      }
    </section>`;

  bindQuit();
  app.querySelectorAll(".option:not([disabled])").forEach((b) =>
    b.addEventListener("click", () => pickQcm(Number(b.dataset.i)))
  );
  app.querySelector("#next")?.addEventListener("click", next);
  focusMain();

  setKeys((e) => {
    if (e.target.closest?.("input, textarea")) return;
    if (!session.answered && /^[1-4]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < session.options.length) pickQcm(i);
    } else if (session.answered && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
      e.preventDefault();
      next();
    }
  });
}

function pickQcm(i) {
  if (session.answered) return;
  session.answered = true;
  session.picked = i;
  session.lastCorrect = session.options[i].correct;
  answerCard(session.lastCorrect);
  renderQcm();
}

/* Flashcards */

function renderFlash() {
  const { card, flipped } = session;
  app.innerHTML = `
    ${topBar()}
    <section class="question">
      ${
        flipped
          ? `<div class="flashcard is-flipped">
               <p class="${promptClass(card)}">${esc(deck.prompt(card))}</p>
               <span class="divider" aria-hidden="true"></span>
               <p class="answer ${deck.answer(card).length > 60 ? "answer-long" : ""}">${esc(deck.answer(card))}</p>
               ${card.dir === "st" || card.entry.cat !== "vocabulaire" ? details(card.entry, card.dir) : ""}
             </div>`
          : `<button type="button" class="flashcard" id="flip" data-autofocus>
               <span class="${promptClass(card)}">${esc(deck.prompt(card))}</span>
               <span class="hint">Réfléchis, puis touche la carte pour voir la réponse</span>
             </button>`
      }
      ${
        flipped
          ? `<div class="judge">
               <button type="button" class="btn btn-ko" id="ko"><span class="key" aria-hidden="true">1</span>Pas su</button>
               <button type="button" class="btn btn-ok" id="ok" data-autofocus><span class="key" aria-hidden="true">2</span>Su</button>
             </div>`
          : ""
      }
    </section>`;

  bindQuit();
  const flip = () => {
    if (session.flipped) return;
    session.flipped = true;
    renderFlash();
  };
  const judge = (correct) => {
    answerCard(correct);
    next();
  };
  app.querySelector("#flip")?.addEventListener("click", flip);
  app.querySelector("#ok")?.addEventListener("click", () => judge(true));
  app.querySelector("#ko")?.addEventListener("click", () => judge(false));
  focusMain();

  setKeys((e) => {
    if (!session.flipped && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      flip();
    } else if (session.flipped && (e.key === "1" || e.key === "ArrowLeft")) judge(false);
    else if (session.flipped && (e.key === "2" || e.key === "ArrowRight")) judge(true);
  });
}

/* ---------- Résultats ---------- */

function renderResults() {
  setKeys(null);
  const results = [...session.firstTry.entries()];
  const good = results.filter(([, ok]) => ok).length;
  const missedKeys = results.filter(([, ok]) => !ok).map(([k]) => k);
  const byKey = new Map(deck.allCards(data.entries, data.categories.map((c) => c.id), "both").map((c) => [c.key, c]));
  const missed = missedKeys.map((k) => byKey.get(k)).filter(Boolean);
  const pct = Math.round((good / results.length) * 100);
  const msg = pct === 100 ? "Sans faute." : pct >= 80 ? "Solide." : pct >= 50 ? "Ça vient." : "On continue, ça rentrera.";

  app.innerHTML = `
    <section class="results">
      <p class="eyebrow">Session terminée</p>
      <p class="score"><span>${good}</span>/${results.length}</p>
      <p class="score-msg">${msg}</p>
      ${
        missed.length
          ? `<h2 class="h-small">À revoir</h2>
             <ul class="missed">
               ${missed
                 .map(
                   (c) => `<li>
                     <span class="tag tag-${c.entry.cat}">${esc(catLabel(c.entry.cat))}</span>
                     <strong>${esc(c.entry.terme)}</strong>
                     <span>${esc(c.entry.sens)}</span>
                   </li>`
                 )
                 .join("")}
             </ul>`
          : ""
      }
      <div class="result-actions">
        ${missed.length ? `<button type="button" class="btn btn-primary btn-big" id="redo" data-autofocus>Refaire mes ${missed.length} erreurs</button>` : ""}
        <button type="button" class="btn ${missed.length ? "btn-ghost" : "btn-primary"} btn-big" id="home" ${missed.length ? "" : "data-autofocus"}>Nouvelle session</button>
      </div>
    </section>`;

  app.querySelector("#redo")?.addEventListener("click", () => startSession(missed));
  app.querySelector("#home").addEventListener("click", renderHome);
  focusMain();
}

/* ---------- Démarrage ---------- */

async function init() {
  try {
    const res = await fetch("data/termes.json");
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    settings.cats = settings.cats.filter((c) => data.categories.some((x) => x.id === c));
    renderHome();
  } catch (err) {
    app.innerHTML = `<p class="form-error">Impossible de charger les termes (${esc(err.message)}). Si tu as ouvert le fichier directement, lance un petit serveur local : voir le README.</p>`;
  }
}

init();
