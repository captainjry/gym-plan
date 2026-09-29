import * as L from './logic.js';
import * as HistoryMod from './history.js';
import * as PlanMod from './plan.js';
import * as ExploreMod from './explore.js';
// Phase-2 screens live in their own modules: each exports render(ctx) → html, optional mount(ctx) after render,
// optional actions {name: (el, ctx, ev) => …} for data-a clicks, optional onInput(ev, ctx) / onChange(ev, ctx).
const MODS = { history: HistoryMod, plan: PlanMod, explore: ExploreMod };

const KEY = 'gp.v1';
const DATA = 'https://exercise-dataset.com/';
const DEFAULT_PLANS = { upperlower: 'plans/upperlower.json', ppl: 'plans/ppl.json' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const now = () => new Date().toISOString();
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso)) / 864e5);

// ---------- storage ----------
let S;
function blank() {
  return { version: 1, activePlanId: 'upperlower', plans: {}, rotation: {}, sessions: [], inProgress: null, bodyweight: [], settings: { lastBackupAt: null } };
}
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch { toast('Could not save — storage full or blocked'); return false; }
}
async function defaultPlans() {
  const out = {};
  for (const [id, path] of Object.entries(DEFAULT_PLANS)) {
    const p = await (await fetch(path)).json();
    out[id] = { ...p, id, source: path };
  }
  return out;
}
const plan = (id = S.activePlanId) => S.plans[id] || Object.values(S.plans)[0];
const dayOf = (p, id) => p.days.find((d) => d.id === id);

// ---------- RepDB (runtime only; never bundled) ----------
let DB = null, dbReq = null;
function db() {
  dbReq ||= fetch(DATA + 'exercises.json').then((r) => r.json()).then((j) => {
    DB = new Map((j.exercises || j).map((x) => [x.id, x]));
    // hydrate only the picture boxes in place — no re-render, no layout shift
    document.querySelectorAll('[data-pics]').forEach((el) => (el.innerHTML = picImgs(el.dataset.pics)));
    document.querySelectorAll('[data-thumb]').forEach((el) => (el.innerHTML = thumbImg(el.dataset.thumb)));
    if (route() === 'workout') preloadNext();
    setTimeout(warmImages, 3000);
  }).catch(() => { dbReq = null; });
  return dbReq;
}
// 134 RepDB entries (holds/stretches) have a single `main` pose instead of start/peak
const img = (id, which) => { const f = DB?.get(id)?.images?.flat; const p = f && (f[which] || (which === 'start' ? f.main : null)); return p ? DATA + p : null; };
// Fixed square boxes (CSS aspect-ratio); skeleton spans until the dataset is known
const picImgs = (id) => (DB?.get(id)?.images?.flat?.main ? ['start'] : ['start', 'peak']).map((w) => {
  const u = img(id, w);
  return u ? `<img crossorigin="anonymous" alt="" decoding="async" src="${u}">` : '<span class="ph"></span>';
}).join('');
const thumbImg = (id) => { const u = img(id, 'start'); return u ? `<img crossorigin="anonymous" alt="" decoding="async" src="${u}">` : '<span class="ph"></span>'; };
const pics = (id, cls = '') => (id ? `<div class="pics ${cls}" data-pics="${esc(id)}">${picImgs(id)}</div>` : '');
function preloadImgs(id) {
  for (const w of ['start', 'peak']) { const u = img(id, w); if (u) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = u; } }
}
function warmImages() { // so pictures work offline in the gym
  const ids = new Set();
  for (const p of Object.values(S.plans)) for (const d of p.days) for (const x of d.exercises)
    [x.repdbId, x.repdbImageId, ...(x.alternatives || [])].forEach((i) => i && ids.add(i));
  for (const id of ids) for (const w of ['start', 'peak']) { const u = img(id, w); if (u) fetch(u, { mode: 'cors' }).catch(() => {}); }
}

// ---------- UI helpers ----------
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}
// Bottom sheet: pushes a same-URL history entry so the back gesture closes it first.
let sheetOpen = false, afterClose = null;
function sheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="backdrop" data-a="close"></div><div class="panel">${html}</div>`;
  s.hidden = false; s.classList.remove('closing');
  if (!sheetOpen) history.pushState({ n: curN, sheet: true }, '');
  sheetOpen = true;
}
function closeSheet(then) { // → popstate → closeSheetDom → then()
  if (!sheetOpen) return then?.();
  afterClose = then || null;
  if (history.state?.sheet) history.back(); else closeSheetDom();
}
function closeSheetDom() {
  sheetOpen = false;
  const s = $('#sheet'); s.classList.add('closing');
  setTimeout(() => { if (!sheetOpen) { s.hidden = true; s.innerHTML = ''; } }, reduce.matches ? 0 : 180);
  const f = afterClose; afterClose = null; f?.();
}
let askOk = null;
function ask(msg, okLabel, onOk, danger = true) {
  askOk = onOk;
  sheet(`<p class="ask">${msg}</p><div class="row"><button class="btn" data-a="close">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="ask-ok">${esc(okLabel)}</button></div>`);
}

// ---------- routing: tiny hash router; every entry carries {n} so back/forward direction is known ----------
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const TAB = (() => { try { return (sessionStorage.gpTab ||= String(Math.random())); } catch { return 'x'; } })();
let curN = 0, afterPop = null;
const parts = () => (location.hash.slice(1) || 'today').split('/');
const route = () => parts()[0];
function transition(fn, dir = 'fade') {
  if (!document.startViewTransition || reduce.matches) return fn();
  document.documentElement.dataset.dir = dir;
  document.startViewTransition(fn);
}
function nav(hash, { replace = false, dir = 'fwd' } = {}) {
  if (replace) history.replaceState({ n: curN }, '', hash);
  else history.pushState({ n: ++curN }, '', hash);
  show(dir);
}
function show(dir) { transition(() => { render(); window.scrollTo(0, 0); }, dir); }
function goBack() { if (curN > 0) history.back(); else nav('#today', { replace: true, dir: 'back' }); }
addEventListener('popstate', (e) => {
  if (sheetOpen) return closeSheetDom();
  const n = e.state?.n ?? 0;
  const dir = n < curN ? 'back' : 'fwd';
  curN = n;
  if (afterPop) { const f = afterPop; afterPop = null; return f(); }
  show(dir);
});

function render() {
  let r = route();
  const inWorkout = r === 'workout' || r === 'summary';
  if (inWorkout && !S.inProgress) { history.replaceState({ n: curN }, '', '#today'); r = 'today'; }
  document.body.classList.toggle('workout', r === 'workout' || r === 'summary');
  document.body.dataset.r = r; document.body.toggleAttribute('data-sub', r !== 'today' && parts().length > 1); // desktop CSS hooks
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r));
  const mod = MODS[r];
  const v = mod ? () => mod.render(ctx) : ({ today, settings, workout, summary }[r] || today);
  $('#view').innerHTML = v();
  mod?.mount?.(ctx);
  showUpdateBar();
  if (r === 'workout') { lockOn(); preloadNext(); } else if (r !== 'summary') lockOff();
}

// ---------- Today ----------
function today() {
  const p = plan();
  const rotIdx = S.rotation[p.id] || 0;
  const nextId = L.nextDayId(p, rotIdx);
  const d = dayOf(p, parts()[1]) || dayOf(p, nextId); // #today/<dayId> = picked day overview
  const dayId = d.id;
  const last = L.lastSessionFor(S.sessions, p.id, d.id);
  const ip = S.inProgress;
  const ipDay = ip && dayOf(plan(ip.planId), ip.dayId);
  const nudge = backupNudge();
  return `
  ${ip ? `<a class="banner" href="#workout" data-a="resume"><b>Resume workout</b><span>${esc(ipDay?.name)} · ${ip.entries.reduce((n, e) => n + e.sets.length, 0)} sets logged</span></a>` : ''}
  ${nudge ? `<a class="banner warn" href="#settings"><b>Back up your data</b><span>${nudge}</span></a>` : ''}
  <div id="planupd">${planUpdHtml()}</div>
  ${weekHtml(p)}
  <div class="seg">${Object.values(S.plans).map((x) => `<button class="${x.id === p.id ? 'on' : ''}" data-a="plan" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
  <div class="chips">${p.rotation.map((id) => `<button class="chip ${id === dayId ? 'on' : ''}" data-a="day" data-id="${id}">${esc(dayOf(p, id).name)}${id === nextId ? ' <small>next</small>' : ''}</button>`).join('')}</div>
  <section class="card">
    <h1>${esc(d.name)}</h1>
    <p class="th">${esc(d.nameTh)}</p>
    <p class="muted">${esc(d.focus)}</p>
    <p class="muted">Last trained: ${last ? `${fmtDate(last.finishedAt)} (${daysAgo(last.finishedAt)} d ago)` : 'never'}</p>
  </section>
  <ol class="exlist">${d.exercises.map((x) => {
    const ls = L.lastSetsFor(S.sessions, x.name);
    const up = L.progression(x, ls);
    const gid = x.repdbId || x.repdbImageId;
    return `<li role="button" tabindex="0" class="tap" data-a="ov-guide" data-slot="${esc(x.id)}" aria-label="${esc(x.name)} guide">${gid ? `<i class="thumb" data-thumb="${esc(gid)}">${thumbImg(gid)}</i>` : '<i class="thumb"></i>'}<div><b>${esc(x.name)}</b>
      <span class="muted">${x.sets} × ${x.repMin}–${x.repMax}${x.perSide ? ' · per side' : ''}${x.supersetWith ? ` <span class="tag sspill">SS ⇄ ${esc(L.shortName(d.exercises.find((q) => q.id === x.supersetWith)?.name))}</span>` : ''}</span></div>
      <div class="kgcol">${x.nextKg != null ? `next ${esc(L.fmtKg(x.nextKg))} <span class="tag">set</span>` : ls.length ? `last ${esc(L.fmtSet(ls[0]))}` : `start ${esc(L.fmtKg(x.startKg))}`}${up != null && x.nextKg == null ? `<span class="up">↑ ${esc(L.fmtKg(up))}</span>` : ''}</div></li>`;
  }).join('')}</ol>
  <p class="credit">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a></p>
  <div class="dock"><button class="btn primary big" data-a="start" data-plan="${p.id}" data-day="${d.id}">${ip ? 'Start new workout' : 'Start workout'}</button></div>`;
}

function weekHtml(p) {
  const w = L.weekDots(S.sessions), goal = p.rotation.length;
  const dots = w.days.map((on, k) => `<span class="wd ${on ? 'on' : ''} ${k === w.today ? 'now' : ''}"><i></i>${'MTWTFSS'[k]}</span>`).join('');
  return `<a class="weekcard" href="#history" aria-label="${w.count} of ${goal} workouts this week, open history"><div class="wdots">${dots}</div><div class="wcount"><b>${w.count} / ${goal}</b> this week <span>History ›</span></div></a>`;
}

// ---------- Workout player ----------
let draft = null; // {i, kg, reps} unsaved input values
function slot(i) { // effective exercise for entry i (swaps keep the slot's targets)
  const ip = S.inProgress;
  const e = ip.entries[i];
  const x = dayOf(plan(ip.planId), ip.dayId).exercises.find((q) => q.id === e.slotId) || dayOf(plan(ip.planId), ip.dayId).exercises[i];
  if (!e.swapped) return { ...x, imgId: x.repdbImageId || x.repdbId, guideId: x.repdbId || x.repdbImageId, assist: x.startKg < 0 };
  return { ...x, name: e.name, startKg: null, nextKg: null, noteTh: '', warmup: x.warmup, imgId: e.repdbId, guideId: e.repdbId, assist: /assist/.test(e.repdbId), swappedFrom: x.name };
}
const alignedExs = (ip) => L.alignedExs(dayOf(plan(ip.planId), ip.dayId).exercises, ip.entries);
function startWorkout(planId, dayId) {
  const d = dayOf(plan(planId), dayId);
  S.inProgress = {
    id: 's' + Date.now(), planId, dayId, startedAt: now(), cur: 0, rest: null,
    entries: d.exercises.map((x) => ({ slotId: x.id, repdbId: x.repdbId, name: x.name, swapped: false, sets: [], done: false, skipped: false })),
  };
  S.inProgress.backTo = { tab: TAB, n: curN }; // the overview entry to return to
  draft = null;
  save(); nav('#workout');
}
const shownKg = (kg, assist) => (kg == null ? '' : String(assist ? Math.abs(kg) : kg));

// Player: full render only when the exercise changes (with a view transition);
// logging / deleting a set on the same exercise patches just the affected nodes (patchPlayer).
function pstate() {
  const ip = S.inProgress, i = ip.cur, e = ip.entries[i], x = slot(i);
  const ls = L.lastSetsFor(S.sessions, x.name);
  const n = ip.entries.length, closed = ip.entries.filter((q) => q.done || q.skipped).length;
  return { ip, i, e, x, ls, n, closed, allDone: closed === n, pre: L.prefill(x, ls, e.sets) };
}
const setLabel = (e, x) => {
  const k = e.sets.length + 1;
  return k <= x.sets ? `Set ${k} of ${x.sets}${k > 1 ? ' <span class="muted">(optional)</span>' : ''}` : `Extra set ${k}`;
};
const loggedHtml = (e) => e.sets.map((s, k) => `<span class="chip">${k + 1}: ${esc(L.fmtSet(s))}<button data-a="del-set" data-k="${k}" aria-label="delete set">×</button></span>`).join('');
const hintHtml = (up, e, x) => (e.sets.length ? '' : x.nextKg != null ? '<p class="up" id="hint">set from Today</p>' : up != null ? `<p class="up big" id="hint">↑ Try ${esc(L.fmtKg(up))}${up < 0 ? '' : ' kg'}</p>` : '');
const allDoneHtml = (on) => (on ? '<a class="banner" href="#summary"><b>All exercises done</b><span>Tap to review &amp; save</span></a>' : '');
function formHtml({ i, e, x, pre }) {
  if (e.done || e.skipped) return `<div class="card center"><p>${e.skipped ? 'Skipped' : 'Exercise done ✓'}</p>
    <button class="btn" data-a="${e.skipped ? 'unskip' : 'extra'}">${e.skipped ? 'Do it now' : '+ Add extra set'}</button></div>`;
  const kg = draft?.i === i ? draft.kg : shownKg(pre.kg, x.assist);
  const reps = draft?.i === i ? draft.reps : String(pre.reps ?? '');
  const kgLabel = x.assist ? 'kg assist' : x.perSide ? 'kg/side' : 'kg';
  return `<div class="stepper"><button data-a="kg-" aria-label="less weight">−</button>
      <label><input id="kg" inputmode="decimal" value="${esc(kg)}" placeholder="${x.startKg == null && !e.swapped ? 'BW' : ''}" autocomplete="off"><span>${kgLabel}</span></label>
      <button data-a="kg+" aria-label="more weight">+</button></div>
    <div class="stepper"><button data-a="reps-" aria-label="fewer reps">−</button>
      <label><input id="reps" inputmode="numeric" value="${esc(reps)}" autocomplete="off"><span>reps</span></label>
      <button data-a="reps+" aria-label="more reps">+</button></div>
    <button class="btn ghost linkbtn" data-a="finish-ex" id="finish-ex" ${e.sets.length ? '' : 'hidden'}>Finish exercise</button>`;
}
function workout() {
  const st = pstate(), { ip, i, e, x, ls, n, closed, allDone } = st;
  const d = dayOf(plan(ip.planId), ip.dayId);
  const up = L.progression(x, ls);
  const p = L.partnerIndex(alignedExs(ip), i);
  return `
  <header class="phead">
    <button class="btn ghost small" data-a="back">‹ Today</button>
    <div class="ptitle">${esc(d.name)} · ${i + 1}/${n}</div>
    <a class="btn small ${allDone ? 'primary' : ''}" id="finish-link" href="#summary">Finish</a>
  </header>
  <div class="progress"><i id="prog" style="transform:scaleX(${closed / n})"></i></div>
  <div id="alldone">${allDoneHtml(allDone)}</div>
  <section class="ex">
    <h1>${esc(x.name)}</h1>
    ${x.swappedFrom ? `<p class="muted">Swapped for ${esc(x.swappedFrom)} (this session)</p>` : ''}
    <div class="exhead"><div data-a="guide">${pics(x.imgId, 'small')}</div>
      <div class="exinfo"><p class="target">${esc(L.fmtTarget(x))}${x.perSide ? ' · per side' : ''}</p>
        ${p >= 0 ? `<p class="warm"><span class="tag sspill">SS</span> ⇄ ${esc(ip.entries[p].name)}</p>` : ''}
        ${x.warmup ? `<p class="muted warm">Warm-up: ${esc(x.warmup)}</p>` : ''}</div></div>
    ${x.noteTh ? `<p class="th note clamp" data-a="more">${esc(x.noteTh)}</p>` : ''}
    <div class="lastrow"><span class="last">Last time: ${ls.length ? esc(ls.map(L.fmtSet).join(', ')) : '—'}</span>
      <span class="setlabel" id="setlabel" ${e.done || e.skipped ? 'hidden' : ''}>${setLabel(e, x)}</span></div>
    ${hintHtml(up, e, x)}
    <div class="logged" id="logged">${loggedHtml(e)}</div>
    <div id="form">${formHtml(st)}</div>
  </section>
  <div class="dock">
    <div class="navrow">
      <button class="btn" data-a="prev" ${i === 0 ? 'disabled' : ''}>‹ Prev</button>
      <button class="btn" data-a="swap" id="swap-btn">Swap</button>
      <button class="btn" data-a="guide">Guide</button>
      <button class="btn" data-a="skip" id="skip-btn" ${e.done || e.skipped ? 'disabled' : ''}>Skip</button>
      <button class="btn" data-a="next" ${i === n - 1 ? 'disabled' : ''}>Next ›</button>
    </div>
    <button class="btn primary big" data-a="done-set" id="done-btn" ${e.done || e.skipped ? 'hidden' : ''}>Done set</button>
  </div>
  ${ip.rest ? restHtml() : ''}`;
}
// Same exercise still on screen: touch only what changed; existing inputs keep their nodes (and focus).
function patchPlayer(formKindChanged) {
  const st = pstate(), { e, x, n, closed, allDone, pre } = st;
  $('#logged').innerHTML = loggedHtml(e);
  $('#hint')?.remove();
  $('#logged').insertAdjacentHTML('beforebegin', hintHtml(L.progression(x, st.ls), e, x));
  $('#prog').style.transform = `scaleX(${closed / n})`;
  $('#alldone').innerHTML = allDoneHtml(allDone);
  $('#finish-link').classList.toggle('primary', allDone);
  $('#skip-btn').disabled = e.done || e.skipped;
  $('#done-btn').hidden = e.done || e.skipped;
  $('#setlabel').innerHTML = setLabel(e, x);
  $('#setlabel').hidden = e.done || e.skipped;
  if (formKindChanged || !$('#kg')) $('#form').innerHTML = formHtml(st);
  else {
    $('#kg').value = shownKg(pre.kg, x.assist);
    $('#reps').value = String(pre.reps ?? '');
    $('#finish-ex').hidden = !e.sets.length;
  }
  $('#rest')?.remove();
  if (S.inProgress.rest) $('#view').insertAdjacentHTML('beforeend', restHtml());
}

let restEnter = false; // slide the rest sheet up only when a rest starts, not on every re-render
function restHtml() {
  const ip = S.inProgress, nx = ip.entries[ip.cur];
  const cls = restEnter ? 'enter' : ''; restEnter = false;
  return `<div id="rest" class="${cls}"><div class="restlabel">Rest</div><div id="rest-num" class="restnum">${mmss(ip.rest.endsAt - Date.now())}</div>
    <div class="restbar"><i id="rest-bar"></i></div>
    <p class="muted">Next: ${esc(nx.name)} · set ${nx.sets.length + 1}</p>
    <div class="row"><button class="btn" data-a="rest-15">−15 s</button><button class="btn" data-a="rest+15">+15 s</button><button class="btn primary" data-a="rest-skip">Skip</button></div></div>`;
}
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function readInputs(x) {
  const kgRaw = ($('#kg')?.value || '').replace(',', '.').trim();
  const reps = parseInt($('#reps')?.value, 10);
  let kg = kgRaw === '' ? null : Number(kgRaw);
  if (kg != null && !Number.isFinite(kg)) return { err: 'Weight is not a number' };
  if (!(reps > 0)) return { err: 'Enter reps' };
  if (kg != null && x.assist) kg = -Math.abs(kg);
  return { kg, reps };
}
function doneSet() {
  audioOn();
  const ip = S.inProgress, i = ip.cur, e = ip.entries[i], x = slot(i);
  const v = readInputs(x);
  if (v.err) return toast(v.err);
  const px = planEx(ip, e); // first logged set consumes the Today override
  if (!e.sets.length && !e.swapped && px?.nextKg != null) delete px.nextKg;
  e.sets.push({ kg: v.kg, reps: v.reps, at: now() });
  if (e.sets.length >= x.sets) e.done = true;
  const d = dayOf(plan(ip.planId), ip.dayId);
  const { next, rest } = L.afterSet(alignedExs(ip), ip.entries, i);
  ip.cur = next;
  ip.rest = rest ? { endsAt: Date.now() + x.restSec * 1000, total: x.restSec * 1000 } : null;
  restEnter = rest; draft = null; save();
  // new exercise (superset partner / next) = new screen; same exercise = patch in place
  if (next !== i) transition(() => { render(); window.scrollTo(0, 0); }, 'fwd');
  else patchPlayer(e.done);
}
function preloadNext() { // warm the images of whatever can come next
  const ip = S.inProgress; if (!ip || !DB) return;
  for (const j of new Set([L.partnerIndex(alignedExs(ip), ip.cur), L.nextOpen(ip.entries, ip.cur), ip.cur + 1]))
    if (j >= 0 && j < ip.entries.length && j !== ip.cur) preloadImgs(slot(j).imgId);
}
function go(i) {
  if (i === S.inProgress.cur) { save(); return patchPlayer(true); }
  const dir = i < S.inProgress.cur ? 'back' : 'fwd';
  S.inProgress.cur = i; draft = null; save();
  transition(() => { render(); window.scrollTo(0, 0); }, dir);
}

// rest timer: timestamp-based, survives sleep/background/reload
setInterval(tick, 250);
function tick() {
  const r = S?.inProgress?.rest;
  if (!r) return;
  const left = r.endsAt - Date.now();
  if (left <= 0) {
    if (left > -10000) { navigator.vibrate?.([300, 150, 300]); beep(); }
    S.inProgress.rest = null; save(); $('#rest')?.remove();
    return;
  }
  const num = $('#rest-num'), bar = $('#rest-bar');
  if (num) num.textContent = mmss(left);
  if (bar) bar.style.transform = `scaleX(${Math.min(1, left / r.total)})`;
}
let ac = null;
function audioOn() { try { ac ||= new AudioContext(); ac.resume(); } catch {} }
function beep() {
  if (!ac) return;
  try {
    for (const t of [0, 0.3, 0.6]) {
      const o = ac.createOscillator(), g = ac.createGain(), s = ac.currentTime + t;
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.5, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(g).connect(ac.destination); o.start(s); o.stop(s + 0.22);
    }
  } catch {}
}
let wl = null;
async function lockOn() {
  try { if (!wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => (wl = null)); } } catch {}
}
function lockOff() { wl?.release().catch(() => {}); wl = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { tick(); if (document.body.classList.contains('workout')) lockOn(); }
});

// "Next session kg" editor, shown only when the Guide is opened from Today
const shownNk = (x) => shownKg(x.nextKg ?? L.defaultNextKg(x, L.lastSetsFor(S.sessions, x.name)), x.startKg < 0);
function nkHtml(x) {
  const label = x.startKg < 0 ? 'kg assist' : x.perSide ? 'kg/side' : 'kg';
  return `<div class="nkrow"><b>Next session kg</b>
    <div class="stepper"><button data-a="nk-" aria-label="less weight">−</button>
      <label><input id="nk" inputmode="decimal" value="${esc(shownNk(x))}" placeholder="${x.startKg == null ? 'BW' : ''}" autocomplete="off"><span>${label}</span></label>
      <button data-a="nk+" aria-label="more weight">+</button>
      <button class="btn primary" data-a="nk-save">Save</button></div>
    ${x.nextKg != null ? '<button class="btn ghost linkbtn" data-a="nk-clear">Clear</button>' : ''}</div>`;
}
let nkRef = null; // {planId, dayId, slotId} of the exercise whose Guide was opened from Today
const nkEx = () => nkRef && dayOf(plan(nkRef.planId), nkRef.dayId)?.exercises.find((q) => q.id === nkRef.slotId);
function nkSet(v) {
  const x = nkEx(); if (!x) return;
  if (v == null) delete x.nextKg; else x.nextKg = v;
  save();
  closeSheet(() => { render(); toast(v == null ? 'Override cleared' : `Next session: ${L.fmtKg(v)} kg`); });
}
function guideSheet(id, x, fromToday) {
  const r = DB?.get(id);
  const q = encodeURIComponent(`${r?.name_en || x.name} form`).replace(/%20/g, '+');
  sheet(`<button class="btn small close" data-a="close">Close</button>
    <h2>${esc(r?.name_en || x.name)}</h2>
    ${fromToday ? nkHtml(x) : ''}
    ${pics(id, 'large')}
    ${x.warmup ? `<p class="muted">Warm-up: ${esc(x.warmup)}</p>` : ''}
    ${x.noteTh ? `<p class="th note">${esc(x.noteTh)}</p>` : ''}
    ${r ? `<h3>How to</h3><ol>${r.instructions_en.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <h3>Tips</h3><ul>${(r.tips_en || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : DB ? '' : dbReq ? '<div class="sk"></div><div class="sk"></div><div class="sk short"></div>' : '<p class="muted">Exercise details load once you are online.</p>'}
    <a class="btn big" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">Watch on YouTube</a>
    <p class="credit">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a></p>`);
}
const planEx = (ip, e) => dayOf(plan(ip.planId), ip.dayId).exercises.find((q) => q.id === e.slotId);
function swapSheet() {
  const ip = S.inProgress, i = ip.cur, e = ip.entries[i];
  const x = planEx(ip, e);
  const opt = (id, name, orig) => `<button class="swapopt" data-a="swap-to" data-id="${id ?? ''}" ${orig ? 'data-orig="1"' : ''}>
    ${pics(id || x.repdbImageId, 'small')}<span>${esc(name)}${orig ? ' <small>(plan)</small>' : ''}</span></button>`;
  sheet(`<button class="btn small close" data-a="close">Close</button><h2>Swap for this session</h2>
    ${e.swapped ? opt(x.repdbId, x.name, true) : ''}
    ${(x.alternatives || []).filter((a) => a !== e.repdbId || !e.swapped).map((a) => opt(a, DB?.get(a)?.name_en || a)).join('')}`);
}

// ---------- Summary ----------
function summary() {
  const ip = S.inProgress, d = dayOf(plan(ip.planId), ip.dayId);
  const done = ip.entries.filter((e) => e.sets.length);
  const sets = done.reduce((n, e) => n + e.sets.length, 0);
  const bests = L.sessionBests(done, S.sessions);
  const mins = Math.round((Date.now() - new Date(ip.startedAt)) / 60000);
  return `<header class="phead"><button class="btn ghost small" data-a="back">‹ Back</button><div class="ptitle">Summary</div><span></span></header>
  <section class="card"><h1>${esc(d.name)}</h1>
    <div class="stats"><div><b>${done.length}</b><span>exercises</span></div><div><b>${sets}</b><span>sets</span></div><div><b>${mins}</b><span>min</span></div></div></section>
  ${bests.length ? `<section class="card"><h3>New bests</h3>${bests.map((b) => `<p class="up">★ ${esc(b.name)} — ${esc(L.fmtSet(b.set))}</p>`).join('')}</section>` : ''}
  <ol class="exlist">${done.map((e) => `<li><div><b>${esc(e.name)}</b></div><div class="kgcol">${esc(e.sets.map(L.fmtSet).join(', '))}</div></li>`).join('')}</ol>
  <button class="btn ghost danger-text" data-a="discard">Discard workout</button>
  <div class="dock"><button class="btn primary big" data-a="save" ${sets ? '' : 'disabled'}>${sets ? 'Save workout' : 'Log at least one set'}</button></div>`;
}
function saveWorkout() {
  const ip = S.inProgress, p = plan(ip.planId);
  S.sessions.push({
    id: ip.id, planId: ip.planId, dayId: ip.dayId, dayName: dayOf(p, ip.dayId).name, startedAt: ip.startedAt, finishedAt: now(),
    entries: ip.entries.filter((e) => e.sets.length).map((e) => ({ slotId: e.slotId, repdbId: e.repdbId, name: e.name, ...(e.swapped ? { swapped: true } : {}), sets: e.sets })),
  });
  S.rotation[p.id] = L.advanceRotation(p, ip.dayId, S.rotation[p.id] || 0);
  if (save()) leaveWorkout('Workout saved');
}
// Pop back to the overview entry the workout started from (so back never returns into a finished workout)
function leaveWorkout(msg) {
  const b = S.inProgress?.backTo;
  if (S.inProgress) { S.inProgress = null; save(); }
  const done = () => { history.replaceState({ n: curN }, '', '#today'); show('back'); if (msg) toast(msg); };
  if (b?.tab === TAB && curN > b.n) { afterPop = done; history.go(b.n - curN); } else done();
}

function backupNudge() {
  if (!S.sessions.length) return '';
  const b = S.settings.lastBackupAt;
  if (!b) return 'You have never downloaded a backup.';
  const d = daysAgo(b);
  return d > 14 ? `Last backup was ${d} days ago.` : '';
}
let pendingRestore = null;
function settings() {
  const b = S.settings.lastBackupAt, nudge = backupNudge();
  return `<h1 class="pad">Settings</h1>
  <section class="card"><h3>Backup</h3>
    <p class="muted">Last backup: ${b ? `${fmtDate(b)} (${daysAgo(b)} d ago)` : 'never'}</p>
    ${nudge ? `<p class="warn-text">${nudge} Download one now.</p>` : ''}
    <button class="btn primary big" data-a="backup">Download backup</button>
    <label class="btn big file">Restore from file<input type="file" id="restore" accept="application/json,.json" hidden></label>
    <p class="muted">${S.sessions.length} workouts stored on this device.</p>
  </section>
  <section class="card"><h3>About</h3><p>Gym Plan — personal training log. Works offline.</p>
    <p class="credit">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a></p></section>`;
}
function downloadBackup() {
  S.settings.lastBackupAt = now();
  save();
  const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `gym-backup-${L.ymd()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  render();
}
async function restoreFile(file) {
  let o;
  try { o = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON'); }
  const err = L.validateBackup(o);
  if (err) return toast(`Not a valid backup: ${err}`);
  pendingRestore = o;
  const last = o.sessions.at(-1);
  ask(`Restore <b>${o.sessions.length}</b> workouts${last ? ` (latest ${esc(fmtDate(last.finishedAt || last.startedAt))})` : ''}?<br>This replaces all data on this device.`, 'Replace my data', async () => {
    const o2 = { ...blank(), ...pendingRestore, settings: { ...blank().settings, ...pendingRestore.settings } };
    if (!o2.plans || !Object.keys(o2.plans).length) o2.plans = await defaultPlans();
    S = o2; pendingRestore = null;
    if (save()) toast('Backup restored');
    render();
  });
}

// ---------- app updates (service worker) ----------
// A new SW installs and waits; the user taps the bar to switch. Never shown (so never reloads) mid-workout.
let newSW = null, reloading = false;
function showUpdateBar() {
  const b = $('#update'); if (!b) return;
  b.hidden = !newSW || !!S.inProgress;
  document.body.classList.toggle('has-update', !b.hidden); // push content down, don't cover it
}
function watchUpdates(reg) {
  const found = (w) => { if (w && navigator.serviceWorker.controller) { newSW = w; showUpdateBar(); } };
  found(reg.waiting); // installed during an earlier session
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') found(w); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
}

// ---------- plan updates ----------
let planUpd = {}; // planId → newer shipped default
async function checkPlanUpdates() {
  for (const [id, path] of Object.entries(DEFAULT_PLANS)) {
    try {
      const f = await (await fetch(path, { cache: 'no-store' })).json();
      if (!S.plans[id]) { S.plans[id] = { ...f, id, source: path }; save(); continue; } // new default plan
      if (L.planUpdateAvailable(S.plans[id], f, S.settings.dismissedPlanVersion?.[id])) planUpd[id] = f;
    } catch {}
  }
  const el = $('#planupd'); if (el) el.innerHTML = planUpdHtml();
}
function planUpdHtml() {
  return Object.entries(planUpd).map(([id, f]) => {
    const busy = S.inProgress?.planId === id;
    const mod = S.plans[id]?.modified === true;
    return `<section class="card upd"><p><b>New version of ${esc(S.plans[id]?.name || f.name)} available</b> (v${esc(f.version)})</p>
      ${mod ? `<p class="warn-text">You've edited this plan — updating replaces your edits (history is kept).</p>` : ''}
      ${busy ? '<p class="muted">Finish the current workout to update.</p>' : ''}
      <div class="row"><button class="btn" data-a="plan-keep" data-id="${id}">Keep mine</button>
      <button class="btn ${mod ? 'danger' : 'primary'}" data-a="plan-update" data-id="${id}" ${busy ? 'disabled' : ''}>${mod ? 'Replace with new version' : 'Update'}</button></div></section>`;
  }).join('');
}
function applyPlanUpdate(id) {
  if (S.inProgress?.planId === id) return; // slot() reads the live plan by position
  const f = planUpd[id];
  S.plans[id] = L.carryNextKg(S.plans[id], { ...f, id, source: DEFAULT_PLANS[id], modified: false });
  S.rotation[id] = L.clampRotation(S.rotation[id] || 0, S.plans[id]);
  delete planUpd[id];
  if (save()) toast('Plan updated');
  if (parts()[1]) history.replaceState({ n: curN }, '', '#today');
  transition(render);
}

// ---------- events ----------
document.addEventListener('click', (ev) => {
  const link = ev.target.closest('a[href^="#"]');
  if (link && !link.dataset.a) { // in-app links: no reload; tabs replace each other so back returns to Today
    ev.preventDefault();
    const h = link.getAttribute('href');
    if (h === location.hash) return;
    if (!link.closest('#tabs')) return nav(h);
    if (h === '#today' && curN > 0) return history.back();
    return nav(h, { replace: route() !== 'today', dir: 'fade' });
  }
  const t = ev.target.closest('[data-a]');
  if (!t || t.disabled) return;
  const a = t.dataset.a, ip = S.inProgress;
  const act = {
    close: closeSheet,
    'ask-ok': () => { const f = askOk; askOk = null; closeSheet(f); },
    plan: () => { S.activePlanId = t.dataset.id; save(); if (parts()[1]) history.replaceState({ n: curN }, '', '#today'); transition(render); },
    day: () => nav(`#today/${t.dataset.id}`, { replace: !!parts()[1], dir: 'fade' }),
    back: goBack,
    resume: () => { S.inProgress.backTo = { tab: TAB, n: curN }; save(); nav('#workout'); },
    start: () => ip
      ? ask('Discard the workout in progress and start a new one?', 'Discard & start', () => startWorkout(t.dataset.plan, t.dataset.day))
      : startWorkout(t.dataset.plan, t.dataset.day),
    more: () => t.classList.toggle('open'),
    'done-set': doneSet,
    'kg-': () => bump('kg', -1), 'kg+': () => bump('kg', 1), 'reps-': () => bump('reps', -1), 'reps+': () => bump('reps', 1),
    'finish-ex': () => { ip.entries[ip.cur].done = true; const n = L.nextOpen(ip.entries, ip.cur); go(n < 0 ? ip.cur : n); },
    extra: () => { ip.entries[ip.cur].done = false; save(); patchPlayer(true); },
    skip: () => { ip.entries[ip.cur].skipped = true; const n = L.nextOpen(ip.entries, ip.cur); go(n < 0 ? ip.cur : n); },
    unskip: () => { ip.entries[ip.cur].skipped = false; save(); patchPlayer(true); },
    prev: () => go(ip.cur - 1), next: () => go(ip.cur + 1),
    'del-set': () => ask('Delete this set?', 'Delete', () => {
      const e = ip.entries[ip.cur]; const was = e.done; e.sets.splice(+t.dataset.k, 1); e.done = false; save(); patchPlayer(was);
    }),
    'ov-guide': () => {
      const d = dayOf(plan(), parts()[1] || L.nextDayId(plan(), S.rotation[plan().id] || 0));
      const x = d.exercises.find((q) => q.id === t.dataset.slot);
      if (x) { nkRef = { planId: plan().id, dayId: d.id, slotId: x.id }; guideSheet(x.repdbId || x.repdbImageId, x, true); db(); }
    },
    'nk-': () => nkBump(-1), 'nk+': () => nkBump(1),
    'nk-save': () => {
      const raw = $('#nk').value.replace(',', '.').trim(), n = Number(raw), x = nkEx();
      if (raw === '' || !Number.isFinite(n)) return toast('Enter a weight');
      nkSet(x.startKg < 0 ? -Math.abs(n) : n);
    },
    'nk-clear': () => nkSet(null),
    guide: () => { const x = slot(ip.cur); guideSheet(x.guideId, x); },
    swap: swapSheet,
    'swap-to': () => {
      const e = ip.entries[ip.cur], x = planEx(ip, e);
      const to = t.dataset.orig ? { repdbId: x.repdbId, name: x.name, swapped: false }
        : { repdbId: t.dataset.id, name: DB?.get(t.dataset.id)?.name_en || t.dataset.id, swapped: true };
      const apply = () => {
        if (e.sets.length) ip.cur = L.splitEntry(ip.entries, ip.cur, to.repdbId, to.name, to.swapped); // sets stay under the old exercise
        else Object.assign(e, to);
        ip.rest = null; draft = null; save(); transition(render);
      };
      if (!e.sets.length) return closeSheet(apply);
      closeSheet(() => ask(`Switch to ${esc(to.name)}? The ${e.sets.length} logged set${e.sets.length > 1 ? 's' : ''} ${e.sets.length > 1 ? "stay" : "stays"} under ${esc(e.name)}.`, 'Switch', apply, false));
    },
    'rest-15': () => { ip.rest.endsAt -= 15000; save(); tick(); },
    'rest+15': () => { ip.rest.endsAt += 15000; ip.rest.total = Math.max(ip.rest.total, ip.rest.endsAt - Date.now()); save(); tick(); },
    'rest-skip': () => { ip.rest = null; save(); $('#rest')?.remove(); },
    save: saveWorkout,
    discard: () => ask('Discard this workout? Logged sets will be lost.', 'Discard', () => leaveWorkout('Workout discarded')),
    backup: downloadBackup,
    update: () => { if (!newSW) return; reloading = true; newSW.postMessage('skipWaiting'); },
    'plan-update': () => S.plans[t.dataset.id]?.modified === true
      ? ask('Replace your edited plan with the new version? Your edits are lost; workout history is kept.', 'Replace', () => applyPlanUpdate(t.dataset.id))
      : applyPlanUpdate(t.dataset.id),
    'plan-keep': () => { (S.settings.dismissedPlanVersion ||= {})[t.dataset.id] = planUpd[t.dataset.id].version; delete planUpd[t.dataset.id]; save(); $('#planupd').innerHTML = planUpdHtml(); },
  }[a];
  if (act) { ev.preventDefault(); act(); return; }
  const mact = Object.values(MODS).map((m) => m.actions?.[a]).find(Boolean);
  if (mact) { ev.preventDefault(); mact(t, ctx, ev); }
});
function bump(field, dir) {
  const inp = $('#' + field); if (!inp) return;
  const x = slot(S.inProgress.cur);
  const step = field === 'reps' ? 1 : x.stepKg || 2.5;
  const cur = Number(inp.value.replace(',', '.')) || 0;
  inp.value = String(Math.max(0, Math.round((cur + dir * step) * 100) / 100));
  saveDraft();
}
function nkBump(dir) {
  const inp = $('#nk'), step = nkEx()?.stepKg || 2.5;
  inp.value = String(Math.max(0, Math.round(((Number(inp.value.replace(',', '.')) || 0) + dir * step) * 100) / 100));
}
function saveDraft() { if ($('#kg') || $('#reps')) draft = { i: S.inProgress.cur, kg: $('#kg')?.value ?? '', reps: $('#reps')?.value ?? '' }; }
document.addEventListener('input', (ev) => { if (ev.target.id === 'kg' || ev.target.id === 'reps') return saveDraft(); MODS[route()]?.onInput?.(ev, ctx); });
document.addEventListener('change', (ev) => { if (ev.target.id === 'restore' && ev.target.files[0]) { restoreFile(ev.target.files[0]); ev.target.value = ''; return; } MODS[route()]?.onChange?.(ev, ctx); });
document.addEventListener('focusin', (ev) => { if (ev.target.matches?.('#kg,#reps')) { ev.target.select(); setTimeout(() => ev.target.scrollIntoView({ block: 'center' }), 250); } });

// ---------- shared context handed to the phase-2 modules ----------
const ctx = {
  get S() { return S; }, save, L, DATA, esc, now, fmtDate, daysAgo,
  toast, sheet, closeSheet, ask, nav, goBack, parts, route,
  rerender: (dir = 'fade') => transition(render, dir),
  plan, dayOf, defaultPlans, db, get DB() { return DB; }, img, pics, preloadImgs,
};

// ---------- boot ----------
(async function init() {
  S = load();
  if (!S || S.version !== 1) S = blank();
  if (!S.plans || !Object.keys(S.plans).length) {
    try { S.plans = await defaultPlans(); } catch { $('#view').innerHTML = '<p class="pad">Could not load plans. Connect once to finish setup.</p>'; return; }
    save();
  }
  if (!S.plans[S.activePlanId]) S.activePlanId = Object.keys(S.plans)[0];
  if (!history.state || history.state.sheet) history.replaceState({ n: history.state?.n ?? 0 }, '');
  curN = history.state.n;
  render();
  db();
  navigator.storage?.persist?.().catch(() => {});
  checkPlanUpdates();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(watchUpdates).catch(() => {});
})();
