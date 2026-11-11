'use strict';

/* ---------- constants ---------- */
const STORE_KEY = 'native-names-v1';
const INTERVALS = [2, 4, 8, 16, 32, 64];   // questions until a country is due again, by box
const MASTER_BOX = 3;                        // 3 correct in a row = mastered
const UNLOCK_NEED = { 2: 7, 3: 15 };         // mastered in the previous tier to unlock this one
const TIER_NAMES = { 1: 'Level 1 · The famous ones', 2: 'Level 2 · Getting around', 3: 'Level 3 · Deep cuts' };
const BY_ID = Object.fromEntries(COUNTRIES.map(c => [c.id, c]));

/* ---------- state ---------- */
const DEFAULT_STATE = () => ({
  progress: {},            // id -> { box, correct, wrong, due }
  score: 0, streak: 0, best: 0,
  asked: 0, right: 0,
  mode: 'mix', unlockAll: false,
  unlocked: 1,
  recent: [],
});
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(DEFAULT_STATE(), JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return DEFAULT_STATE();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}
function prog(id) {
  return S.progress[id] || (S.progress[id] = { box: 0, correct: 0, wrong: 0, due: 0, seen: 0 });
}
const isMastered = id => (S.progress[id]?.box || 0) >= MASTER_BOX;
const masteredIn = tier => COUNTRIES.filter(c => c.tier === tier && isMastered(c.id)).length;
const masteredCount = () => COUNTRIES.filter(c => isMastered(c.id)).length;

function highestUnlocked() {
  if (S.unlockAll) return 3;
  let t = 1;
  if (masteredIn(1) >= UNLOCK_NEED[2]) t = 2;
  if (t === 2 && masteredIn(2) >= UNLOCK_NEED[3]) t = 3;
  return Math.max(t, S.unlocked || 1);
}

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
}
function buzz(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { /* ignore */ } }

/* ---------- map ---------- */
const map = (() => {
  const svg = $('#map');
  const g = $('#world');
  let vbW = MAP.w, vbH = MAP.h;
  let lastBox = null, lastPad = 1, lastMax = 1;
  const paths = {};

  // build once
  const ns = 'http://www.w3.org/2000/svg';
  const sphere = document.createElementNS(ns, 'path');
  sphere.setAttribute('d', MAP.sphere); sphere.setAttribute('class', 'sphere');
  g.appendChild(sphere);
  for (const [id, c] of Object.entries(MAP.countries)) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', c.d); p.setAttribute('class', 'c'); p.dataset.id = id;
    g.appendChild(p); paths[id] = p;
  }
  const borders = document.createElementNS(ns, 'path');
  borders.setAttribute('d', MAP.borders); borders.setAttribute('class', 'borders');
  g.appendChild(borders);

  function size() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ar = r.height / r.width;
    if (ar >= MAP.h / MAP.w) { vbW = MAP.w; vbH = MAP.w * ar; } else { vbH = MAP.h; vbW = MAP.h / ar; }
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  }
  function apply(box, pad, maxK, animate = true) {
    const [x, y, w, h] = box;
    // wide targets (Russia, China) get less padding so they fill the view
    const p = Math.max(1.25, pad - w / 260);
    const k = Math.min(vbW / (w * p), vbH / (h * p), maxK);
    let tx = vbW / 2 - k * (x + w / 2);
    let ty = vbH / 2 - k * (y + h / 2);
    // keep the world's edges from drifting into the view when zoomed in; centre it when zoomed out
    const W = k * MAP.w, H = k * MAP.h;
    tx = W >= vbW ? Math.min(0, Math.max(vbW - W, tx)) : (vbW - W) / 2;
    ty = H >= vbH ? Math.min(0, Math.max(vbH - H, ty)) : (vbH - H) / 2;
    g.classList.toggle('no-anim', !animate);
    g.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    if (!animate) { void g.getBoundingClientRect(); g.classList.remove('no-anim'); }
    lastBox = box; lastPad = pad; lastMax = maxK;
  }
  function fit(ids, pad = 2.2, maxK = 9) {
    const boxes = ids.map(id => MAP.countries[id].b);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, w, h] of boxes) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
    // small countries should still fill a decent share of the view
    const w = Math.max(x1 - x0, 24), h = Math.max(y1 - y0, 24);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    apply([cx - w / 2, cy - h / 2, w, h], pad, maxK);
  }
  function world(animate = true) { apply([0, 0, MAP.w, MAP.h], 1.02, 1, animate); }
  function refit(animate = false) { size(); if (lastBox) apply(lastBox, lastPad, lastMax, animate); }
  function set(id, cls, on = true) { paths[id] && paths[id].classList.toggle(cls, on); }
  function clear(...classes) { for (const p of Object.values(paths)) p.classList.remove(...classes); }
  function paint() {
    for (const c of COUNTRIES) {
      const p = paths[c.id]; if (!p) continue;
      const pr = S.progress[c.id];
      p.classList.toggle('known', !!pr);
      p.classList.toggle('mastered', isMastered(c.id));
      p.classList.toggle('learning', !!pr && !isMastered(c.id));
    }
  }
  function onTap(cb) {
    svg.addEventListener('click', e => {
      const p = e.target.closest('path.c');
      if (p && p.classList.contains('candidate')) cb(p.dataset.id);
    });
  }
  size(); world(false);
  window.addEventListener('resize', () => refit(false));
  return { fit, world, refit, set, clear, paint, onTap };
})();

/* ---------- speech ---------- */
const speech = (() => {
  const ok = 'speechSynthesis' in window;
  let voices = [];
  function refresh() { if (ok) voices = speechSynthesis.getVoices(); }
  if (ok) { refresh(); speechSynthesis.addEventListener('voiceschanged', refresh); }
  const norm = s => s.toLowerCase().replace('_', '-');
  function pick(lang) {
    if (!voices.length) refresh();
    const want = norm(lang), base = want.split('-')[0];
    return voices.find(v => norm(v.lang) === want)
        || voices.find(v => norm(v.lang).startsWith(base + '-'))
        || voices.find(v => norm(v.lang) === base)
        || null;
  }
  // returns { spoke:boolean, note:string|null }
  function speak(country, onEnd) {
    if (!ok) return { spoke: false, note: 'Speech is not available in this browser.' };
    speechSynthesis.cancel();
    const v = pick(country.lang);
    const u = new SpeechSynthesisUtterance();
    let note = null;
    if (v) { u.voice = v; u.lang = v.lang; u.text = country.native; }
    else {
      const en = pick('en-US') || pick('en');
      if (!en || !country.roman) return { spoke: false, note: `No ${langName(country)} voice is installed on this device.` };
      u.voice = en; u.lang = en.lang; u.text = country.roman.split('/')[0].trim();
      note = `No ${langName(country)} voice on this device, so this is an English voice reading the romanisation.`;
    }
    u.rate = 0.85;
    u.onend = u.onerror = () => onEnd && onEnd();
    speechSynthesis.speak(u);
    return { spoke: true, note };
  }
  function langName(c) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(c.lang.split('-')[0]); } catch (e) { return c.language.split(/,| and /)[0]; }
  }
  return { speak, available: ok };
})();

function wireSpeakButtons(root) {
  root.querySelectorAll('[data-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = BY_ID[btn.dataset.speak];
      const res = speech.speak(c, () => btn.classList.remove('is-speaking'));
      if (res.spoke) btn.classList.add('is-speaking');
      const note = root.querySelector('.voice-note');
      if (note) note.textContent = res.note || '';
      else if (res.note) toast(res.note, 3200);
    });
  });
}

/* ---------- question selection (spaced repetition) ---------- */
function unlockedCountries() {
  const top = highestUnlocked();
  return COUNTRIES.filter(c => c.tier <= top);
}
function pickCountry() {
  const pool = unlockedCountries();
  const recent = new Set(S.recent.slice(-4));
  let items = pool.map(c => {
    const pr = S.progress[c.id];
    let w;
    if (!pr) w = 3;
    else if (pr.due <= S.asked) w = pr.box === 0 ? 6 : pr.box === 1 ? 4 : pr.box === 2 ? 3 : 1.5;
    else w = isMastered(c.id) ? 0.05 : 0.25;
    if (recent.has(c.id)) w *= 0.05;
    // nudge newer tiers so a fresh unlock shows up quickly
    if (!pr && c.tier === highestUnlocked() && c.tier > 1) w *= 1.5;
    return { c, w };
  });
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.w; if (r <= 0) return i.c; }
  return items[items.length - 1].c;
}
function pickMode() {
  if (S.mode !== 'mix') return S.mode;
  const r = Math.random();
  return r < 0.42 ? 'name' : r < 0.8 ? 'reverse' : 'say';
}
function distractors(target, n = 3) {
  const pool = COUNTRIES.filter(c => c.id !== target.id);
  const same = shuffle(pool.filter(c => c.region === target.region));
  const rest = shuffle(pool.filter(c => c.region !== target.region));
  // mostly same region so the options feel plausible, but never all four from one tiny region
  const take = Math.min(same.length, 2);
  return shuffle(same.slice(0, take).concat(rest.slice(0, n - take)));
}

/* ---------- quiz ---------- */
let Q = null; // current question

function nextQuestion() {
  closeSheet();
  const country = pickCountry();
  const mode = pickMode();
  Q = { country, mode, done: false };
  if (mode === 'name') {
    Q.options = shuffle([country, ...distractors(country)]);
  } else if (mode === 'reverse') {
    Q.options = shuffle([country, ...distractors(country)]);
  }
  renderQuestion();
}

function renderQuestion() {
  const { country: c, mode } = Q;
  const q = $('#question');
  const hint = $('#map-hint');
  map.clear('focus', 'candidate', 'correct', 'wrong');
  map.paint();

  if (mode === 'name') {
    map.set(c.id, 'focus'); map.fit([c.id]);
    hint.textContent = '';
    q.innerHTML = `
      <p class="prompt">What does <span class="hl">${esc(c.name)}</span> call itself?</p>
      <div class="options">${Q.options.map(o => `
        <button class="opt" data-id="${o.id}">
          <span class="main" lang="${o.lang}">${esc(o.native)}</span>
          ${o.roman ? `<span class="sub">${esc(o.roman)}</span>` : ''}
        </button>`).join('')}
      </div>`;
  } else if (mode === 'reverse') {
    Q.options.forEach(o => map.set(o.id, 'candidate'));
    map.fit(Q.options.map(o => o.id), 1.5, 6);
    hint.textContent = 'Tap the country on the map, or choose below';
    q.innerHTML = `
      <p class="prompt">Which country calls itself…</p>
      <div class="native-big" lang="${c.lang}">${esc(c.native)}</div>
      ${c.roman ? `<div class="native-sub">${esc(c.roman)}</div>` : ''}
      <div class="options">${Q.options.map(o => `
        <button class="opt" data-id="${o.id}"><span class="main">${esc(o.name)}</span></button>`).join('')}
      </div>`;
  } else {
    map.set(c.id, 'focus'); map.fit([c.id]);
    hint.textContent = '';
    q.innerHTML = `
      <p class="prompt"><span class="hl">${esc(c.name)}</span> in ${esc(c.language.split(/,| and /)[0])}. Listen, then say it.</p>
      <div class="native-big" lang="${c.lang}">${esc(c.native)}</div>
      ${c.roman ? `<div class="native-sub">${esc(c.roman)}</div>` : ''}
      <button class="btn teal hear-big" data-speak="${c.id}">🔊 Hear it</button>
      <div class="voice-note"></div>
      <div class="say-row">
        <button class="btn soft" data-grade="0">Still tricky</button>
        <button class="btn good" data-grade="1">I said it 👍</button>
      </div>`;
    wireSpeakButtons(q);
    q.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => answer(null, b.dataset.grade === '1')));
  }
  q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(b.dataset.id)));
}

map.onTap(id => { if (Q && Q.mode === 'reverse' && !Q.done) answer(id); });

function answer(chosenId, selfGrade) {
  if (!Q || Q.done) return;
  Q.done = true;
  const c = Q.country;
  const correct = Q.mode === 'say' ? !!selfGrade : chosenId === c.id;

  // progress
  const pr = prog(c.id);
  pr.seen++;
  S.asked++;
  const wasMastered = isMastered(c.id);
  if (correct) {
    pr.correct++; pr.box = Math.min(pr.box + 1, INTERVALS.length - 1);
    pr.due = S.asked + INTERVALS[pr.box];
    S.streak++; S.best = Math.max(S.best, S.streak); S.right++;
    S.score += 10 + Math.min(S.streak, 10) * 2;
  } else {
    pr.wrong++; pr.box = 0; pr.due = S.asked + 2;
    S.streak = 0;
    buzz([40, 60, 40]);
  }
  S.recent = S.recent.concat(c.id).slice(-6);

  // unlock check
  const before = S.unlocked || 1;
  const now = highestUnlocked();
  let unlockMsg = null;
  if (now > before) {
    S.unlocked = now;
    const n = COUNTRIES.filter(x => x.tier === now).length;
    unlockMsg = `${TIER_NAMES[now].split(' · ')[0]} unlocked: ${n} more countries`;
  }
  save();
  renderStats(correct);

  // mark UI
  const q = $('#question');
  q.querySelectorAll('.opt').forEach(b => {
    b.disabled = true;
    if (b.dataset.id === c.id) b.classList.add('is-correct');
    else if (b.dataset.id === chosenId) b.classList.add('is-wrong');
    else b.classList.add('is-dim');
  });
  q.querySelectorAll('[data-grade]').forEach(b => { b.disabled = true; });
  map.clear('focus', 'candidate');
  map.paint();
  if (chosenId && chosenId !== c.id) map.set(chosenId, 'wrong');
  map.set(c.id, 'correct');
  if (Q.mode === 'reverse') map.fit([c.id]);
  $('#map-hint').textContent = '';

  const justMastered = !wasMastered && isMastered(c.id);
  setTimeout(() => showFactCard(c, { correct, justMastered, unlockMsg, mode: Q.mode }), Q.mode === 'say' ? 150 : 650);
}

/* ---------- fact card ---------- */
function factCardHTML(c, opts = {}) {
  const verdict = opts.correct == null ? '' :
    `<div class="verdict ${opts.correct ? 'good' : 'bad'}">${opts.correct ? (opts.justMastered ? '★ Mastered!' : 'Correct!') : 'Not quite'}</div>`;
  return `
    ${verdict}
    <div class="card-head">
      <div>
        <div class="card-name">${esc(c.name)}</div>
        <div class="card-native" lang="${c.lang}">${esc(c.native)}</div>
        <div class="card-roman">${c.roman ? esc(c.roman) : '&nbsp;'}${c.alt ? ` <span style="opacity:.7">· ${esc(c.alt)}</span>` : ''}</div>
      </div>
      <button class="btn teal speak" data-speak="${c.id}" aria-label="Hear it">🔊</button>
    </div>
    <div class="voice-note"></div>
    <div class="card-section"><h4>Why English says “${esc(c.name)}”</h4><p>${esc(c.origin)}</p></div>
    <div class="card-section"><h4>Did you know</h4><ul>${c.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="meta">
      <span class="chip">🏛 ${esc(c.capital)}</span>
      <span class="chip">💬 ${esc(c.language)}</span>
      <span class="chip">${TIER_NAMES[c.tier].split(' · ')[0]}</span>
    </div>`;
}
function showFactCard(c, opts) {
  const body = $('#sheet-body');
  body.innerHTML = factCardHTML(c, opts) + `
    <div class="sheet-actions">
      <button class="btn primary" id="btn-next">Next →</button>
    </div>`;
  wireSpeakButtons(body);
  $('#btn-next').addEventListener('click', () => { nextQuestion(); if (opts.unlockMsg) toast(opts.unlockMsg, 3500); });
  openSheet();
  body.scrollTop = 0;
}
function showStudyCard(c) {
  const body = $('#sheet-body');
  body.innerHTML = factCardHTML(c) + `
    <div class="sheet-actions"><button class="btn soft" id="btn-close">Close</button></div>`;
  wireSpeakButtons(body);
  $('#btn-close').addEventListener('click', closeSheet);
  openSheet();
  body.scrollTop = 0;
}
function openSheet() { $('#sheet').classList.add('is-open'); $('#sheet-backdrop').classList.add('is-open'); }
function closeSheet() {
  $('#sheet').classList.remove('is-open'); $('#sheet-backdrop').classList.remove('is-open');
  if (speech.available) speechSynthesis.cancel();
}
$('#sheet-backdrop').addEventListener('click', () => {
  // during a quiz the backdrop acts like Next; in study mode it just closes
  const next = $('#btn-next');
  if (next) next.click(); else closeSheet();
});

/* ---------- stats / header ---------- */
function renderStats(bumpAll) {
  const set = (id, v, bump) => {
    const el = $(id); const b = el.querySelector('b');
    if (b.textContent !== String(v)) { b.textContent = v; if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
  };
  set('#chip-streak', S.streak, bumpAll);
  set('#chip-score', S.score, bumpAll);
  set('#chip-mastered', masteredCount(), bumpAll);
}

/* ---------- progress screen ---------- */
function renderProgress() {
  const body = $('#progress-body');
  const top = highestUnlocked();
  const acc = S.asked ? Math.round(100 * S.right / S.asked) : 0;
  let html = `
    <div class="stat-grid">
      <div class="stat"><div class="n">${masteredCount()}<span style="font-size:14px;color:var(--muted)">/${COUNTRIES.length}</span></div><div class="l">mastered</div></div>
      <div class="stat"><div class="n">${S.best}</div><div class="l">best streak</div></div>
      <div class="stat"><div class="n">${acc}%</div><div class="l">accuracy · ${S.asked} asked</div></div>
    </div>
    <div class="legend"><span><i style="background:var(--land-known)"></i>seen</span><span><i style="background:var(--accent)"></i>learning</span><span><i style="background:var(--good)"></i>mastered (3 in a row)</span></div>`;
  for (const tier of [1, 2, 3]) {
    const list = COUNTRIES.filter(c => c.tier === tier);
    const locked = tier > top;
    const need = tier > 1 ? `${masteredIn(tier - 1)}/${UNLOCK_NEED[tier]} of level ${tier - 1} mastered to unlock` : '';
    html += `<div class="tier-head ${locked ? 'locked' : ''}"><h3>${locked ? '🔒 ' : ''}${esc(TIER_NAMES[tier])}</h3><span>${locked ? need : `${masteredIn(tier)}/${list.length} mastered`}</span></div>
      <div class="country-grid">${list.map(c => {
        const st = isMastered(c.id) ? 'mastered' : S.progress[c.id] ? 'learning' : '';
        return `<button class="cc ${st} ${locked ? 'locked' : ''}" data-id="${c.id}" ${locked ? 'disabled' : ''}>
          <span class="dot"></span><span class="t"><span class="en">${esc(c.name)}</span><span class="na" lang="${c.lang}">${locked ? '• • •' : esc(c.native)}</span></span></button>`;
      }).join('')}</div>`;
  }
  html += `
    <div class="settings">
      <button class="btn row-btn ${S.unlockAll ? 'on' : ''}" id="btn-unlock"><span>Unlock every level</span><span class="sw"></span></button>
      <button class="btn row-btn danger" id="btn-reset"><span>Reset all progress</span><span>⟲</span></button>
      <p class="voice-note" style="text-align:left">Tap any country to open its fact card. Progress lives only on this device. Data: Natural Earth map, 89 countries.</p>
    </div>`;
  body.innerHTML = html;
  body.querySelectorAll('.cc:not([disabled])').forEach(b => b.addEventListener('click', () => showStudyCard(BY_ID[b.dataset.id])));
  $('#btn-unlock').addEventListener('click', () => { S.unlockAll = !S.unlockAll; S.unlocked = highestUnlocked(); save(); renderProgress(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Reset score, streak and every country? This cannot be undone.')) return;
    S = DEFAULT_STATE(); save(); renderStats(); renderProgress(); map.paint(); nextQuestion();
    toast('Fresh start');
  });
}

/* ---------- navigation ---------- */
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('is-on', x === t));
  const name = t.dataset.screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  closeSheet();
  if (name === 'progress') renderProgress();
  else { map.refit(false); }
}));
document.querySelectorAll('.mode').forEach(m => m.addEventListener('click', () => {
  S.mode = m.dataset.mode; save();
  document.querySelectorAll('.mode').forEach(x => x.classList.toggle('is-on', x === m));
  nextQuestion();
}));

/* ---------- boot ---------- */
document.querySelectorAll('.mode').forEach(x => x.classList.toggle('is-on', x.dataset.mode === S.mode));
S.unlocked = highestUnlocked();
renderStats();
map.paint();
nextQuestion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
