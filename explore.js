// Explore tab: body map, muscle panel, library, exercise detail + add-to-plan.
// Contract: see MODS comment in app.js. Body-map figure is original artwork (hand-drawn paths below).
const RN = {}; // region id → REGIONS entry (filled on first use; logic.js comes via ctx.L)
const st = { view: 'map', side: 'front', region: null, gym: 'my', equip: '', q: '', limit: 60 }; // session-only UI state
let C; // ctx

// ---------- figure: viewBox 200×420, left half drawn, mirrored about x=100 ----------
// [region, d, center?]  region '' = non-muscle filler
const SIL = 'M100,9 C89,9 83,17 83,29 C83,39 86,46 90,51 L90,59 C84,65 74,69 63,73 C51,77 45,87 44,100 C43,112 45,124 46,134 C46,146 43,158 40,170 C37,186 35,200 36,212 C33,222 33,236 37,242 C41,247 48,245 50,239 C52,229 51,220 52,212 C55,196 59,178 62,161 C64,149 65,137 66,124 L67,112 C69,130 71,150 72,170 C72,186 68,200 66,212 C62,236 62,262 65,286 C67,298 67,308 67,316 C63,334 63,356 69,376 L71,386 C65,394 65,402 71,406 L88,406 C89,398 87,391 86,384 C89,360 89,340 87,320 C88,310 90,302 92,292 C96,270 98,246 98,226 L101,224 L101,9 Z';
const FIG = {
  front: [
    ['upperback', 'M90,61 C85,66 77,70 68,73 C76,74 83,74 89,74 C91,70 92,66 92,62 Z'],
    ['sidedelts', 'M62,76 C52,79 47,88 46.5,100 C46.5,108 47.5,114 49,120 C50,108 53,97 58,88 C59.5,84 61,80 62,76 Z'],
    ['frontdelts', 'M65,76 C63,82 60,90 58,97 C55,105 53,112 51.5,120 C58,114 64,106 68.5,98 C70.5,91 70.5,83 69.5,77 Z'],
    ['upperchest', 'M72,76.5 C80,76 90,76 98.5,77 L98.5,92 C88,92.5 79,93 71.5,95 C71,88 71,82 72,76.5 Z'],
    ['chest', 'M71.5,97.5 C79,95.5 88,95 98.5,94.5 L98.5,118 C92,122 84,124 77,121 C72,118 69.5,112 69.5,106 C69.5,102 70.5,99.5 71.5,97.5 Z'],
    ['biceps', 'M52,122 C50,130 49,142 51,152 C53,157 58,158 61,154 C64,146 65,134 65,122 C64,116 60,112 56,114 C54,116 53,119 52,122 Z'],
    ['forearms', 'M49,162 C45,174 41,190 40,206 C41,210 46,211 49,208 C52,194 57,178 61,164 C60,159 55,157 52,158 C51,159 50,160 49,162 Z'],
    ['abs', 'M88,124 L98.5,124 L98.5,141 L88,141 Q86.5,141 86.5,139.5 L86.5,125.5 Q86.5,124 88,124 Z'],
    ['abs', 'M88,144 L98.5,144 L98.5,160 L88,160 Q86.5,160 86.5,158.5 L86.5,145.5 Q86.5,144 88,144 Z'],
    ['abs', 'M88,163 L98.5,163 L98.5,179 L88,179 Q86.5,179 86.5,177.5 L86.5,164.5 Q86.5,163 88,163 Z'],
    ['abs', 'M88,182 L98.5,182 L98.5,212 C94,210 90,204 87.5,196 L86.5,184 Q86.5,182 88,182 Z'],
    ['obliques', 'M72,123 C77,125 81.5,127 84.5,129 L84.5,194 C80.5,198 76,202 71,205 C71,190 71,176 73,166 C71,150 70.5,136 72,123 Z'],
    ['hipflexors', 'M73,208.5 C79,205.5 84,205 87,206 C89,212 91,219 94,226 C86,223 78.5,217.5 73,208.5 Z'],
    ['quads', 'M67,214 C71,216 77,220 84,226 C88,229 90.5,233 91,240 C91.5,258 90.5,277 87,291 C83,298 76,299 72,294 C66,282 64,262 65,242 C65,232 66,222 67,214 Z'],
    ['adductors', 'M93.5,229 C96.5,236 98,246 97.5,256 C97,262 95.5,268 93,274 C93.5,262 93.5,250 93,238 Z'],
    ['calves', 'M68,321 C64.5,334 64.5,352 69.5,372 C73,366 76,352 76,338 C76,330 73,323 68,321 Z'],
    ['calves', 'M86.5,321 C89.5,334 89.5,352 86.5,370 C83.5,360 82,346 82.5,332 C83,327 84.5,323 86.5,321 Z'],
  ],
  back: [
    ['upperback', 'M98.5,54 L98.5,142 C94,126 88,112 82,100 C78,91 72,83 66,77 C74,74 82,71 88,67 C92,63 95,59 98.5,54 Z'],
    ['sidedelts', 'M62,76 C52,79 47,88 46.5,100 C46.5,108 47.5,114 49,120 C50,108 53,97 58,88 C59.5,84 61,80 62,76 Z'],
    ['reardelts', 'M64.5,78 C67,83 70,88 73.5,93 C68,103 60,113 51.5,120 C53,108 55.5,97 59,89 C61,84 62.5,81 64.5,78 Z'],
    ['lats', 'M76,98 C81,107 87,118 92,128 C95,134 97,140 97,146 C94,160 88,176 80,190 C76,184 73,176 72,166 C70,150 69,132 69,116 C70,108 72,102 76,98 Z'],
    ['lowerback', 'M98.5,147 L98.5,206 C94,206 90,204 86,200 C84,194 84,186 86,180 C90,170 94,158 98.5,147 Z'],
    ['triceps', 'M51,118 C49,130 48,142 50,154 C54,158 60,158 63,154 C65,142 66,130 65,118 C62,114 56,114 51,118 Z'],
    ['forearms', 'M49,162 C45,174 41,190 40,206 C41,210 46,211 49,208 C52,194 57,178 61,164 C60,159 55,157 52,158 C51,159 50,160 49,162 Z'],
    ['glutes', 'M68,207 C74,201 86,201 98.5,209 L98.5,244 C92,250 80,250 72,246 C66,238 64.5,222 68,207 Z'],
    ['hamstrings', 'M67.5,252 C74,256 84,256 92,252 C93,266 92,282 88,294 C84,298 76,299 72,294 C67,282 65,266 67.5,252 Z'],
    ['calves', 'M68,318 C63,330 63,346 68,358 C72,360 76,356 78,350 C79,338 78,326 76,318 C73,316 70,316 68,318 Z'],
    ['calves', 'M80,318 C80,330 81,344 84,354 C88,358 92,354 91,344 C92,332 90,322 86,318 C84,316 82,316 80,318 Z'],
    ['calves', 'M70.5,362 C72,372 76,380 78,386 L84,386 C86,378 88,370 88,362 C84,364 76,364 70.5,362 Z'],
  ],
};
const onSide = (side, r) => FIG[side].some((f) => f[0] === r);
function figure(side, heat) {
  const cls = (r) => `m${r === st.region ? ' on' : ''}${heat[r] ? ' h1' : ''}`;
  const paths = FIG[side].map(([r, d]) => `<path class="${cls(r)}" data-a="x-reg" data-r="${r}" d="${d}"/>`).join('');
  return `<path class="sil" d="${SIL}"/><g>${paths}</g><g transform="matrix(-1 0 0 1 200 0)"><path class="sil" d="${SIL}"/>${paths}</g>`;
}

// ---------- data helpers ----------
const picUrls = (x) => { // start/peak, or the single 'main' picture some entries have
  const f = x?.images?.flat || {};
  const u = [f.start, f.peak].filter(Boolean);
  return (u.length ? u : [f.main].filter(Boolean)).map((p) => C.DATA + p);
};
const all = () => (C.DB ? [...C.DB.values()] : []);
const eqKey = (x) => C.L.equipOf(x)[0] || 'none';
const eqName = (k) => (k === 'none' ? 'Bodyweight' : k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const human = (m) => m.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const gymOk = (x) => st.gym === 'all' || C.L.isMyGym(x);
const planIds = () => {
  const s = new Set();
  for (const d of C.plan().days) for (const x of d.exercises) { if (x.repdbId) s.add(x.repdbId); if (x.repdbImageId) s.add(x.repdbImageId); }
  return s;
};
function heat() {
  if (!C.DB) return {};
  const S = C.S;
  const idOf = (e, s) => e.repdbId || S.plans[s.planId]?.days.find((d) => d.id === s.dayId)?.exercises.find((x) => x.id === e.slotId)?.repdbImageId;
  return C.L.regionHeat(S.sessions, Date.now() - 7 * 864e5, (id) => C.DB.get(id), idOf);
}

// ---------- screens ----------
export function render(ctx) {
  C = ctx;
  if (!RN.abs) for (const r of ctx.L.REGIONS) RN[r.id] = r;
  const p = ctx.parts();
  if (p[1] === 'ex' && p[2]) return detail(decodeURIComponent(p[2]));
  return `<div class="seg" id="x-seg"><button class="${st.view === 'map' ? 'on' : ''}" data-a="x-view" data-v="map">Body map</button>
    <button class="${st.view === 'lib' ? 'on' : ''}" data-a="x-view" data-v="lib">Library</button></div>
  <div id="x-main">${st.view === 'map' ? mapHtml() : libHtml()}</div>
  <p class="credit">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a></p>`;
}
export function mount(ctx) {
  C = ctx;
  if (ctx.DB) return;
  ctx.db().then(() => {
    if (ctx.route() !== 'explore') return;
    if (ctx.parts()[1] === 'ex') return ctx.rerender();
    refresh();
  });
}
function refresh() { // data arrived / filters changed: patch lists + heat only
  const panel = document.getElementById('x-panel');
  if (panel) panel.innerHTML = panelHtml();
  const lf = document.getElementById('x-lf');
  if (lf) lf.innerHTML = libBody();
  const svg = document.getElementById('x-svg');
  if (svg) svg.innerHTML = figure(st.side, heat());
}

function mapHtml() {
  const h = heat();
  return `<div class="cols x"><div class="c1"><div class="xmap">
    <svg id="x-svg" viewBox="28 4 144 406" role="img" aria-label="Body map, ${st.side}">${figure(st.side, h)}</svg>
    <div class="xside"><button class="${st.side === 'front' ? 'on' : ''}" data-a="x-side" data-s="front">Front</button><button class="${st.side === 'back' ? 'on' : ''}" data-a="x-side" data-s="back">Back</button></div>
    <div class="xlegend"><span><i class="lg on"></i>Selected</span><span><i class="lg h1"></i>Trained, last 7 days</span></div>
  </div></div><div class="c2">
  <div class="xchips" id="x-chips">${C.L.REGIONS.map((r) => `<button class="chip${r.id === st.region ? ' on' : ''}" data-a="x-reg" data-r="${r.id}">${r.name}</button>`).join('')}</div>
  <div id="x-panel">${panelHtml()}</div></div></div>`;
}
const skel = () => `<div class="xlist">${'<div class="xrow"><span class="xth sk"></span><span class="xn"><span class="sk"></span><span class="sk short"></span></span></div>'.repeat(4)}</div>`;
const offline = () => '<p class="muted">The exercise list loads once you are online.</p>';
function panelHtml() {
  const r = RN[st.region];
  if (!r) return '<p class="muted xhint">Tap a muscle on the figure, or a name above, to see what it does and the exercises that train it.</p>';
  const head = `<h2>${r.name}</h2><p class="muted">${r.desc}</p>`;
  if (!C.DB) return head + (navigator.onLine ? skel() : offline());
  const items = C.L.exercisesFor(all(), r.id).filter((e) => gymOk(e.x));
  return head + filters(items.map((e) => e.x)) + list(items.filter((e) => !st.equip || eqKey(e.x) === st.equip));
}
function filters(xs) {
  const eqs = [...new Set(xs.map(eqKey))].sort((a, b) => (a === 'none' ? -1 : b === 'none' ? 1 : a.localeCompare(b)));
  if (st.equip && !eqs.includes(st.equip)) eqs.unshift(st.equip);
  return `<div class="xchips"><button class="chip${st.gym === 'my' ? ' on' : ''}" data-a="x-gym" data-g="my">My gym</button><button class="chip${st.gym === 'all' ? ' on' : ''}" data-a="x-gym" data-g="all">All equipment</button></div>
  <div class="xchips"><button class="chip${!st.equip ? ' on' : ''}" data-a="x-eq" data-e="">Any</button>${eqs.map((k) => `<button class="chip${k === st.equip ? ' on' : ''}" data-a="x-eq" data-e="${C.esc(k)}">${C.esc(eqName(k))}</button>`).join('')}</div>`;
}
function list(items) { // items: [{x, role?}]
  if (!items.length) return '<p class="muted">No exercises match these filters.</p>';
  const mine = planIds();
  const rows = items.slice(0, st.limit).map(({ x, role }) => {
    const u = picUrls(x)[0];
    return `<a class="xrow" href="#explore/ex/${encodeURIComponent(x.id)}">
      ${u ? `<img class="xth" crossorigin="anonymous" loading="lazy" decoding="async" alt="" src="${u}">` : '<span class="xth sk"></span>'}
      <span class="xn"><b>${C.esc(x.name_en)}</b><small>${C.esc(eqName(eqKey(x)))}</small>
      <span class="xb">${role ? `<i class="${role}">${role}</i>` : ''}${mine.has(x.id) ? '<i class="plan">in your plan</i>' : ''}</span></span></a>`;
  }).join('');
  const more = items.length > st.limit ? `<button class="btn xmore" data-a="x-more">Show more (${items.length - st.limit})</button>` : '';
  return `<div class="xlist">${rows}</div>${more}`;
}

function libHtml() {
  return `<input id="x-q" class="xq" type="search" placeholder="Search ${C.DB ? C.DB.size : 601} exercises" value="${C.esc(st.q)}" autocomplete="off" enterkeyhint="search">
  <div id="x-lf">${libBody()}</div>`;
}
function libBody() {
  if (!C.DB) return navigator.onLine ? skel() : offline();
  const q = st.q.trim().toLowerCase();
  const base = all().filter((x) => gymOk(x) && (!q || x.name_en.toLowerCase().includes(q)))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const items = base.filter((x) => !st.equip || eqKey(x) === st.equip).map((x) => ({ x }));
  return filters(base) + `<p class="muted xcount">${items.length} exercise${items.length === 1 ? '' : 's'}</p>` + list(items);
}

function detail(id) {
  const x = C.DB?.get(id);
  const back = `<header class="phead"><button class="btn ghost small" data-a="back">‹ Explore</button><div class="ptitle">Exercise</div><span></span></header>`;
  if (!x) return back + (C.DB ? '<p class="muted pad">Exercise not found.</p>' : navigator.onLine ? `<div class="pics large"><span class="ph"></span><span class="ph"></span></div>${skel()}` : offline());
  const q = encodeURIComponent(`${x.name_en} form`).replace(/%20/g, '+');
  const regs = (k) => C.L.exRegions(x, k).map((r) => `<button class="chip" data-a="x-goreg" data-r="${r}">${RN[r].name}</button>`).join('');
  const mus = (k) => [].concat(x[k] ?? []).filter((m) => typeof m === 'string').map(human).join(', ');
  const inPlan = planIds().has(x.id);
  return `${back}
  <h1 class="pad">${C.esc(x.name_en)}</h1>
  <div class="pics large xpics">${picUrls(x).map((u) => `<img crossorigin="anonymous" alt="" decoding="async" src="${u}">`).join('')}</div>
  <p class="xb"><i>${C.esc(eqName(eqKey(x)))}</i>${C.L.isMyGym(x) ? '' : '<i class="secondary">not in my gym</i>'}${inPlan ? '<i class="plan">in your plan</i>' : ''}</p>
  <section class="card"><h3>Primary</h3><p>${C.esc(mus('primary_muscles'))}</p><div class="xchips wrap">${regs('primary_muscles')}</div>
    ${mus('secondary_muscles') ? `<h3>Secondary</h3><p class="muted">${C.esc(mus('secondary_muscles'))}</p>` : ''}</section>
  <section class="card"><h3>How to</h3><ol class="xol">${(x.instructions_en || []).map((s) => `<li>${C.esc(s)}</li>`).join('')}</ol>
    ${x.tips_en?.length ? `<h3>Tips</h3><ul class="xol">${x.tips_en.map((s) => `<li>${C.esc(s)}</li>`).join('')}</ul>` : ''}</section>
  <a class="btn big" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">Watch on YouTube</a>
  <p class="credit">Exercise data by <a href="https://repdb.co">RepDB (repdb.co)</a></p>
  <div class="dock"><button class="btn primary big" data-a="x-add" data-id="${C.esc(x.id)}">Add to plan</button></div>`;
}

// ---------- add to plan ----------
let addId = null;
function pickPlan() {
  const ps = Object.values(C.S.plans);
  if (ps.length === 1) return pickDay(ps[0].id);
  C.sheet(`<button class="btn small close" data-a="close">Close</button><h2>Add to which plan?</h2>
    ${ps.map((p) => `<button class="btn big" data-a="x-addp" data-id="${C.esc(p.id)}">${C.esc(p.name)}</button>`).join('')}`);
}
function pickDay(planId) {
  const p = C.S.plans[planId];
  const has = (d) => d.exercises.some((e) => e.repdbId === addId);
  C.sheet(`<button class="btn small close" data-a="close">Close</button><h2>Add to which day?</h2><p class="muted">${C.esc(p.name)}</p>
    ${p.days.map((d) => `<button class="btn big" data-a="x-addd" data-plan="${C.esc(planId)}" data-day="${C.esc(d.id)}" ${has(d) ? 'disabled' : ''}>${C.esc(d.name)}${has(d) ? ' (already in)' : ''}</button>`).join('')}`);
}
function addTo(planId, dayId) {
  const x = C.DB.get(addId), p = C.S.plans[planId], d = p?.days.find((q) => q.id === dayId);
  if (!x || !d) return;
  d.exercises.push({
    id: `x-${Date.now().toString(36)}`, name: x.name_en, repdbId: x.id, repdbImageId: x.id,
    alternatives: C.L.alternativesFor(all(), x), primary: C.L.exRegions(x).map((r) => RN[r].tag),
    warmup: '1 × 10–12 light', sets: 2, repMin: 8, repMax: 12, rir: '0–1', restSec: 90, startKg: null, stepKg: 2.5, noteTh: '',
  });
  p.modified = true;
  const ok = C.save();
  C.closeSheet(() => { if (ok) { C.toast(`Added to ${p.name} · ${d.name}`); C.rerender(); } });
}

// ---------- events ----------
function selectRegion(r) {
  st.region = st.region === r ? null : r; st.equip = ''; st.limit = 60;
  if (st.region && !onSide(st.side, st.region)) st.side = onSide('front', st.region) ? 'front' : 'back';
  const svg = document.getElementById('x-svg');
  if (svg) { svg.innerHTML = figure(st.side, heat()); svg.setAttribute('aria-label', `Body map, ${st.side}`); }
  document.querySelectorAll('.xside button').forEach((b) => b.classList.toggle('on', b.dataset.s === st.side));
  document.querySelectorAll('#x-chips .chip').forEach((b) => b.classList.toggle('on', b.dataset.r === st.region));
  document.querySelector('#x-chips .chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  document.getElementById('x-panel').innerHTML = panelHtml();
}
export const actions = {
  'x-view': (t) => {
    st.view = t.dataset.v; st.equip = ''; st.limit = 60;
    document.querySelectorAll('#x-seg button').forEach((b) => b.classList.toggle('on', b === t));
    document.getElementById('x-main').innerHTML = st.view === 'map' ? mapHtml() : libHtml();
  },
  'x-side': (t) => {
    st.side = t.dataset.s;
    if (st.region && !onSide(st.side, st.region)) { st.region = null; document.getElementById('x-panel').innerHTML = panelHtml(); document.querySelectorAll('#x-chips .chip').forEach((b) => b.classList.remove('on')); }
    document.querySelectorAll('.xside button').forEach((b) => b.classList.toggle('on', b === t));
    document.getElementById('x-svg').innerHTML = figure(st.side, heat());
  },
  'x-reg': (t) => selectRegion(t.dataset.r),
  'x-goreg': (t, ctx) => { // detail → map with that muscle selected
    const r = t.dataset.r;
    Object.assign(st, { view: 'map', region: r, equip: '', limit: 60, side: onSide('front', r) ? 'front' : 'back' });
    ctx.goBack();
  },
  'x-gym': (t) => { st.gym = t.dataset.g; st.equip = ''; st.limit = 60; refresh(); },
  'x-eq': (t) => { st.equip = t.dataset.e; st.limit = 60; refresh(); },
  'x-more': () => { st.limit += 60; refresh(); },
  'x-add': (t) => { if (!C.DB) return C.toast('Exercise data is still loading'); addId = t.dataset.id; pickPlan(); },
  'x-addp': (t) => pickDay(t.dataset.id),
  'x-addd': (t) => addTo(t.dataset.plan, t.dataset.day),
};
let qT;
export function onInput(ev) {
  if (ev.target.id !== 'x-q') return;
  clearTimeout(qT);
  qT = setTimeout(() => { st.q = ev.target.value; st.limit = 60; const lf = document.getElementById('x-lf'); if (lf) lf.innerHTML = libBody(); }, 120);
}
