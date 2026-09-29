// Plan tab: plans list, plan/day/exercise editors, RepDB picker, export + import.
// Routes: #plan · #plan/edit/<pid> · #plan/day/<pid>/<did> · #plan/ex/<pid>/<did>/<exid>
// All edits mutate ctx.S.plans[pid] in place, set plan.modified and call ctx.save(). Sessions are never touched.

const MU = {
  pectoralis_major: 'chest', latissimus_dorsi: 'lats', rhomboids: 'upper back', trapezius: 'traps', erector_spinae: 'lower back',
  anterior_deltoid: 'front delts', lateral_deltoid: 'side delts', posterior_deltoid: 'rear delts',
  biceps_brachii: 'biceps', brachialis: 'brachialis', brachioradialis: 'forearms', triceps_brachii: 'triceps',
  quadriceps: 'quads', hamstrings: 'hamstrings', gluteus_maximus: 'glutes', gluteus_medius: 'glutes', adductors: 'adductors',
  abductors: 'abductors', gastrocnemius: 'calves', soleus: 'calves', rectus_abdominis: 'abs', obliques: 'obliques',
  transverse_abdominis: 'abs', hip_flexors: 'hip flexors', forearm_flexors: 'forearms', forearm_extensors: 'forearms',
};
const muName = (m) => MU[m] || String(m).replace(/_/g, ' ');
const MU_GROUPS = {
  Chest: ['pectoralis_major'], Back: ['latissimus_dorsi', 'rhomboids', 'trapezius', 'erector_spinae'],
  Shoulders: ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid'], Biceps: ['biceps_brachii', 'brachialis'],
  Triceps: ['triceps_brachii'], Quads: ['quadriceps'], Hamstrings: ['hamstrings'], Glutes: ['gluteus_maximus', 'gluteus_medius'],
  Calves: ['gastrocnemius', 'soleus'], Abs: ['rectus_abdominis', 'obliques', 'transverse_abdominis'],
};
// "My gym" = everything except free-weight/bodyweight setups and cardio
const EXCL = new Set(['barbell', 'kettlebell', 'resistance_band', 'loop_band', 'suspension_trainer', 'rings', 'ez_bar', 'trap_bar', 'plates',
  'dip_station', 'dip_machine', 'battle_rope', 'slam_ball', 'jump_rope', 'treadmill', 'elliptical', 'air_bike', 'stationary_bike',
  'stair_climber', 'rower', 'sled', 'climbing_rope', 'wrist_roller', 'ab_wheel', 'plyo_box', 'stability_ball']);
const MACHINE = new Set(['leg_press', 'hack_squat', 'leg_curl', 'leg_extension', 'pec_deck', 'glute_ham_developer']);
const EQ_CHIPS = [['gym', 'My gym'], ['machine', 'Machine'], ['cable', 'Cable'], ['dumbbell', 'Dumbbell'], ['smith', 'Smith'], ['all', 'All']];
const eqOk = (e, mode) => {
  const q = e.equipment || '';
  if (mode === 'all') return true;
  if (mode === 'cable') return q === 'cable';
  if (mode === 'dumbbell') return q === 'dumbbell';
  if (mode === 'smith') return q === 'smith_machine';
  if (mode === 'machine') return MACHINE.has(q) || (q.endsWith('_machine') && q !== 'smith_machine');
  return !!q && e.category === 'strength' && !EXCL.has(q);
};
const gymOk = (e) => eqOk(e, 'gym');

let ctxRef, pk = { q: '', eq: 'gym', mu: '' }, pkTarget = null, imp = null, exportPid = null, DEFS = null, defsAsked = false;

const S = () => ctxRef.S;
const esc = (s) => ctxRef.esc(s);
const exKey = (n) => ctxRef.L.exKey(n);
const getPlan = (pid) => S().plans[pid];
const getDay = (p, did) => p?.days.find((d) => d.id === did);
const busy = (pid, did) => { const ip = S().inProgress; return !!ip && ip.planId === pid && (did == null || ip.dayId === did); };
// true (and toast) when the edit must be blocked because that day/plan is being trained right now
const blocked = (pid, did) => { if (!busy(pid, did)) return false; ctxRef.toast('Workout in progress — finish it first'); return true; };
const touch = (p) => { p.modified = true; ctxRef.save(); };
const hasHistory = (name) => S().sessions.some((s) => s.entries.some((e) => exKey(e.name) === exKey(name)));
const fresh = () => ctxRef.rerender('fade');

function syncRotation(p, mode, id) {
  const ids = p.days.map((d) => d.id);
  const plain = new Set(p.rotation).size === p.rotation.length && p.rotation.length === (mode === 'add' ? ids.length - 1 : mode === 'del' ? ids.length + 1 : ids.length);
  if (mode === 'del') p.rotation = p.rotation.filter((r) => r !== id);
  else if (plain) p.rotation = ids;
  else if (mode === 'add') p.rotation.push(id);
  const n = p.rotation.length;
  const i = S().rotation[p.id] || 0;
  S().rotation[p.id] = n && i >= 0 && i < n ? i : 0;
}

// ---------- render ----------
export function render(ctx) {
  ctxRef = ctx;
  const [, sub, pid, did, exid] = ctx.parts();
  const p = getPlan(pid);
  if (sub === 'edit' && p) return planPage(p);
  if (sub === 'day' && p && getDay(p, did)) return dayPage(p, getDay(p, did));
  if (sub === 'ex' && p && getDay(p, did)?.exercises.find((x) => x.id === exid)) return exPage(p, getDay(p, did), getDay(p, did).exercises.find((x) => x.id === exid));
  return listPage();
}
export function mount(ctx) {
  ctxRef = ctx;
  ctx.db();
  if (!defsAsked) {
    defsAsked = true;
    ctx.defaultPlans().then((d) => { DEFS = new Set(Object.keys(d)); if (ctx.route() === 'plan' && !ctx.parts()[1]) fresh(); }).catch(() => { DEFS = new Set(); });
  }
}

const head = (title) => `<header class="phead"><button class="btn ghost small" data-a="back">‹ Back</button><div class="ptitle">${esc(title)}</div><span></span></header>`;
const iconBtn = (a, lbl, txt, extra = '') => `<button class="pl-ib" data-a="${a}" aria-label="${lbl}" ${extra}>${txt}</button>`;

function listPage() {
  const S_ = S();
  const cards = Object.values(S_.plans).map((p) => {
    const act = p.id === S_.activePlanId;
    const nEx = p.days.reduce((n, d) => n + d.exercises.length, 0);
    return `<section class="card pl-card">
      <div class="pl-title"><b>${esc(p.name)}</b>${act ? '<span class="tag">Active</span>' : ''}${p.modified ? '<span class="tag pl-mod">Edited</span>' : ''}</div>
      <p class="muted">${p.days.length} days · ${nEx} exercises</p>
      <div class="pl-acts">
        <a class="btn primary" href="#plan/edit/${esc(p.id)}">Edit</a>
        ${act ? '' : `<button class="btn" data-a="p-active" data-id="${esc(p.id)}">Set active</button>`}
        <button class="btn" data-a="p-dup" data-id="${esc(p.id)}">Duplicate</button>
        ${DEFS?.has(p.id) ? `<button class="btn" data-a="p-reset" data-id="${esc(p.id)}">Reset to default</button>` : ''}
        <button class="btn danger-outline" data-a="p-del" data-id="${esc(p.id)}">Delete</button>
      </div></section>`;
  }).join('');
  return `<h1 class="pad">Plan</h1>${cards}
    <div class="row pl-gap"><button class="btn" data-a="p-new">New empty plan</button><button class="btn" data-a="p-import" data-id="">Import JSON</button></div>`;
}

function planPage(p) {
  const rows = p.days.map((d, i) => `<div class="pl-row">
      <a class="pl-main" href="#plan/day/${esc(p.id)}/${esc(d.id)}"><b>${esc(d.name)}</b>
        <span class="muted">${esc(d.focus || d.nameTh || '')}</span><span class="muted">${d.exercises.length} exercises</span></a>
      ${iconBtn('p-day-up', 'move up', '▲', `data-i="${i}" ${i === 0 ? 'disabled' : ''}`)}${iconBtn('p-day-down', 'move down', '▼', `data-i="${i}" ${i === p.days.length - 1 ? 'disabled' : ''}`)}${iconBtn('p-day-del', 'delete day', '✕', `data-i="${i}"`)}
    </div>`).join('');
  return `${head(p.name)}
    <label class="pl-f"><span>Plan name</span><input data-f="pname" value="${esc(p.name)}" maxlength="60"></label>
    ${busy(p.id) ? '<div class="banner warn"><b>Workout in progress</b><span>Editing is locked for the day you are training.</span></div>' : ''}
    <h3>Days <span class="muted">(rotation follows this order)</span></h3>${rows}
    <button class="btn big" data-a="p-day-add">+ Add day</button>
    <div class="row pl-gap"><button class="btn" data-a="p-export" data-id="${esc(p.id)}">Export</button><button class="btn" data-a="p-import" data-id="${esc(p.id)}">Import JSON</button></div>`;
}

function dayPage(p, d) {
  const lock = busy(p.id, d.id) ? 'disabled' : '';
  const rows = d.exercises.map((x, i) => `<div class="pl-row">
      <a class="pl-main pl-ex" href="#plan/ex/${esc(p.id)}/${esc(d.id)}/${esc(x.id)}"><span class="pl-th">${ctxRef.pics(x.repdbImageId || x.repdbId)}</span>
        <span class="pl-t"><b>${esc(x.name)}</b><span class="muted">${x.sets} × ${x.repMin}–${x.repMax}${x.perSide ? ' · per side' : ''}${x.supersetWith ? ' · SS' : ''}</span></span></a>
      ${iconBtn('p-ex-up', 'move up', '▲', `data-i="${i}" ${i === 0 ? 'disabled' : ''}`)}${iconBtn('p-ex-down', 'move down', '▼', `data-i="${i}" ${i === d.exercises.length - 1 ? 'disabled' : ''}`)}${iconBtn('p-ex-del', 'delete exercise', '✕', `data-i="${i}"`)}
    </div>`).join('') || '<p class="muted">No exercises yet.</p>';
  return `${head(d.name)}
    ${lock ? '<div class="banner warn"><b>Workout in progress</b><span>This day is being trained — editing is locked until you finish.</span></div>' : ''}
    <label class="pl-f"><span>Day name</span><input data-f="dname" value="${esc(d.name)}" maxlength="40" ${lock}></label>
    <label class="pl-f"><span>ชื่อไทย</span><input data-f="dnameTh" value="${esc(d.nameTh)}" maxlength="80" ${lock}></label>
    <label class="pl-f"><span>Focus</span><input data-f="dfocus" value="${esc(d.focus)}" maxlength="80" ${lock}></label>
    <h3>Exercises</h3>${rows}
    <button class="btn primary big" data-a="p-ex-add">+ Add exercise</button>`;
}

function exPage(p, d, x) {
  const lock = busy(p.id, d.id) ? 'disabled' : '';
  const num = (f, label, v, mode = 'decimal') => `<label class="pl-f"><span>${label}</span><input data-f="${f}" inputmode="${mode}" value="${v ?? ''}" ${lock}></label>`;
  const others = d.exercises.filter((o) => o.id !== x.id);
  return `${head(x.name)}
    ${lock ? '<div class="banner warn"><b>Workout in progress</b><span>Editing is locked for this day.</span></div>' : ''}
    <div class="exhead">${x.repdbImageId || x.repdbId ? `<div>${ctxRef.pics(x.repdbImageId || x.repdbId)}</div>` : ''}<div class="exinfo muted">${esc((x.primary || []).join(', '))}</div></div>
    <label class="pl-f"><span>Name <small class="muted">(history is matched by name)</small></span><input data-f="name" value="${esc(x.name)}" maxlength="80" ${lock}></label>
    <div class="pl-grid">
      ${num('sets', 'Sets', x.sets, 'numeric')}${num('rir', 'RIR', esc(x.rir), 'text')}
      ${num('repMin', 'Reps min', x.repMin, 'numeric')}${num('repMax', 'Reps max', x.repMax, 'numeric')}
      ${num('restSec', 'Rest (s)', x.restSec, 'numeric')}${num('startKg', 'Start kg', x.startKg)}
      ${num('stepKg', 'Step kg', x.stepKg)}
    </div>
    <label class="pl-tog"><input type="checkbox" data-f="perSide" ${x.perSide ? 'checked' : ''} ${lock}> Weight per side</label>
    <label class="pl-tog"><input type="checkbox" data-f="assist" ${x.assist ? 'checked' : ''} ${lock}> Assisted (kg = assistance)</label>
    <label class="pl-f"><span>Superset with</span><select data-f="supersetWith" ${lock}><option value="">None</option>${others.map((o) => `<option value="${esc(o.id)}" ${x.supersetWith === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
    <label class="pl-f"><span>Warm-up</span><input data-f="warmup" value="${esc(x.warmup)}" ${lock}></label>
    <label class="pl-f"><span>หมายเหตุ / cues</span><textarea data-f="noteTh" rows="5" ${lock}>${esc(x.noteTh)}</textarea></label>`;
}

// ---------- field edits ----------
const cur = (ctx) => { const [, sub, pid, did, exid] = ctx.parts(); const p = getPlan(pid), d = getDay(p, did); return { sub, p, d, x: d?.exercises.find((e) => e.id === exid) }; };
const toNum = (v) => { const s = String(v).trim().replace(',', '.'); return s === '' ? null : Number.isFinite(Number(s)) ? Number(s) : NaN; };

export function onChange(ev, ctx) {
  ctxRef = ctx;
  const el = ev.target, f = el.dataset.f;
  if (!f) return;
  const { sub, p, d, x } = cur(ctx);
  if (!p || (f !== 'pname' && blocked(p.id, d?.id))) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  if (f === 'pname') { const n = v.trim(); if (!n) { el.value = p.name; return; } p.name = n; return touch(p); }
  if (f === 'dname' || f === 'dnameTh' || f === 'dfocus') {
    const k = { dname: 'name', dnameTh: 'nameTh', dfocus: 'focus' }[f];
    if (k === 'name' && !v.trim()) { el.value = d.name; return; }
    d[k] = v.trim(); return touch(p);
  }
  if (!x) return;
  if (f === 'name') return renameEx(p, x, el, v.trim());
  if (f === 'supersetWith') return setSuperset(p, d, x, v);
  if (f === 'perSide' || f === 'assist') { if (v) x[f] = true; else delete x[f]; return touch(p); }
  if (f === 'warmup' || f === 'noteTh' || f === 'rir') { x[f] = v; return touch(p); }
  // numbers
  const n = toNum(v);
  const isNullable = f === 'startKg' || f === 'stepKg';
  if (Number.isNaN(n) || (n === null && !isNullable) || (['sets', 'repMin', 'repMax'].includes(f) && n < 1) || (f === 'restSec' && n < 0)) { el.value = x[f] ?? ''; return ctx.toast('Enter a valid number'); }
  x[f] = ['sets', 'repMin', 'repMax', 'restSec'].includes(f) ? Math.round(n) : n;
  const q = (k) => document.querySelector(`[data-f=${k}]`);
  if (f === 'repMin' && x.repMin > x.repMax) { x.repMax = x.repMin; q('repMax').value = x.repMax; }
  if (f === 'repMax' && x.repMax < x.repMin) { x.repMin = x.repMax; q('repMin').value = x.repMin; }
  touch(p);
}
function renameEx(p, x, el, nn) {
  const old = x.name;
  if (!nn) { el.value = old; return; }
  if (nn === old) return;
  const apply = () => { x.name = nn; touch(p); fresh(); };
  if (exKey(nn) !== exKey(old) && hasHistory(old)) {
    el.value = old;
    return ctxRef.ask(`History for '${esc(old)}' won't carry over to '${esc(nn)}'. Rename anyway?`, 'Rename', apply, false);
  }
  apply();
}
function setSuperset(p, d, x, id) {
  const unlink = (e) => { const o = d.exercises.find((z) => z.id === e.supersetWith); if (o && o.supersetWith === e.id) delete o.supersetWith; delete e.supersetWith; };
  unlink(x);
  if (id) { const o = d.exercises.find((z) => z.id === id); if (o) { unlink(o); x.supersetWith = id; o.supersetWith = x.id; } }
  touch(p);
}

// ---------- actions ----------
const A = {}; // filled below; exported as `actions`
const need = (ctx, t) => { ctxRef = ctx; const { p, d } = cur(ctx); return { p, d, i: +t.dataset.i }; };

A['p-active'] = (t, ctx) => { ctxRef = ctx; S().activePlanId = t.dataset.id; ctx.save(); ctx.toast('Active plan set'); fresh(); };
A['p-new'] = (t, ctx) => {
  ctxRef = ctx;
  const id = ctx.L.slug('new plan', Object.keys(S().plans));
  S().plans[id] = { id, name: 'New plan', version: 1, rotation: ['d1'], days: [{ id: 'd1', name: 'Day 1', nameTh: '', focus: '', exercises: [] }], modified: true };
  S().rotation[id] = 0; ctx.save(); ctx.nav(`#plan/edit/${id}`);
};
A['p-dup'] = (t, ctx) => {
  ctxRef = ctx;
  const src = getPlan(t.dataset.id), id = ctx.L.slug(src.name + ' copy', Object.keys(S().plans));
  const c = JSON.parse(JSON.stringify(src));
  Object.assign(c, { id, name: `${src.name} (copy)`, modified: true }); delete c.source;
  S().plans[id] = c; S().rotation[id] = 0; ctx.save(); ctx.toast('Plan duplicated'); fresh();
};
A['p-del'] = (t, ctx) => {
  ctxRef = ctx;
  const id = t.dataset.id, p = getPlan(id);
  if (Object.keys(S().plans).length <= 1) return ctx.toast("Can't delete the last plan");
  if (blocked(id)) return;
  ctx.ask(`Delete plan '${esc(p.name)}'? Logged workouts stay in History.`, 'Delete', () => {
    delete S().plans[id]; delete S().rotation[id];
    if (S().activePlanId === id) S().activePlanId = Object.keys(S().plans)[0];
    ctx.save(); fresh();
  });
};
A['p-reset'] = (t, ctx) => {
  ctxRef = ctx;
  const id = t.dataset.id;
  if (blocked(id)) return;
  ctx.ask(`Reset '${esc(getPlan(id).name)}' to the shipped default? Your edits to this plan are lost. Logged workouts are kept.`, 'Reset', async () => {
    try {
      const d = (await ctx.defaultPlans())[id];
      if (!d) return ctx.toast('No default for this plan');
      S().plans[id] = d;
      S().rotation[id] = ctx.L.clampRotation(S().rotation[id] || 0, d);
      ctx.save(); ctx.toast('Plan reset'); fresh();
    } catch { ctx.toast('Could not load the default plan'); }
  });
};

A['p-day-add'] = (t, ctx) => {
  ctxRef = ctx;
  const { p } = cur(ctx); if (blocked(p.id)) return;
  const id = ctx.L.uniqueId(`d${p.days.length + 1}`, p.days.map((d) => d.id));
  p.days.push({ id, name: `Day ${p.days.length + 1}`, nameTh: '', focus: '', exercises: [] });
  syncRotation(p, 'add', id); touch(p); ctx.nav(`#plan/day/${p.id}/${id}`);
};
const dayMove = (dir) => (t, ctx) => {
  const { p, i } = need(ctx, t); if (blocked(p.id)) return;
  if (ctx.L.moveItem(p.days, i, dir)) { syncRotation(p, 'move'); touch(p); fresh(); }
};
A['p-day-up'] = dayMove(-1); A['p-day-down'] = dayMove(1);
A['p-day-del'] = (t, ctx) => {
  const { p, i } = need(ctx, t), d = p.days[i];
  if (p.days.length <= 1) return ctx.toast("Can't delete the last day");
  if (blocked(p.id, d.id)) return;
  ctx.ask(`Delete day '${esc(d.name)}' and its ${d.exercises.length} exercises?`, 'Delete', () => {
    p.days.splice(i, 1); syncRotation(p, 'del', d.id); touch(p); fresh();
  });
};

const exMove = (dir) => (t, ctx) => {
  const { p, d, i } = need(ctx, t); if (blocked(p.id, d.id)) return;
  if (ctx.L.moveItem(d.exercises, i, dir)) { touch(p); fresh(); }
};
A['p-ex-up'] = exMove(-1); A['p-ex-down'] = exMove(1);
A['p-ex-del'] = (t, ctx) => {
  const { p, d, i } = need(ctx, t), x = d.exercises[i];
  if (blocked(p.id, d.id)) return;
  ctx.ask(`Delete '${esc(x.name)}' from ${esc(d.name)}?`, 'Delete', () => {
    d.exercises.splice(i, 1);
    d.exercises.forEach((o) => { if (o.supersetWith === x.id) delete o.supersetWith; });
    touch(p); fresh();
  });
};

// ----- picker -----
const pkList = () => {
  const DB = ctxRef.DB; if (!DB) return [];
  const q = pk.q.trim().toLowerCase(), mus = pk.mu ? MU_GROUPS[pk.mu] : null;
  return [...DB.values()].filter((e) => eqOk(e, pk.eq) && (!q || e.name_en.toLowerCase().includes(q)) && (!mus || (e.primary_muscles || []).some((m) => mus.includes(m))))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
};
function pkRefresh() {
  const chips = document.getElementById('pk-chips'), res = document.getElementById('pk-res');
  if (!chips || !res) return;
  const chip = (a, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-a="${a}" data-v="${v}">${label}</button>`;
  chips.innerHTML = `<div class="chips">${EQ_CHIPS.map(([v, l]) => chip('p-pk-eq', v, l, pk.eq === v)).join('')}</div>
    <div class="chips">${chip('p-pk-mu', '', 'Any muscle', !pk.mu)}${Object.keys(MU_GROUPS).map((m) => chip('p-pk-mu', m, m, pk.mu === m)).join('')}</div>`;
  if (!ctxRef.DB) { res.innerHTML = '<p class="muted">Loading exercise database…</p>'; return; }
  const all = pkList(), shown = all.slice(0, 30);
  res.innerHTML = shown.map((e) => `<button class="swapopt" data-a="p-pk-pick" data-id="${esc(e.id)}">${ctxRef.pics(e.id)}
      <span class="pl-t"><b>${esc(e.name_en)}</b><span class="muted">${esc((e.equipment || 'bodyweight').replace(/_/g, ' '))} · ${esc((e.primary_muscles || []).slice(0, 2).map(muName).join(', '))}</span></span></button>`).join('')
    + (all.length > shown.length ? `<p class="muted center">${all.length - shown.length} more — refine the search</p>` : '') + (all.length ? '' : '<p class="muted">No matches.</p>');
}
A['p-ex-add'] = (t, ctx) => {
  ctxRef = ctx;
  const { p, d } = cur(ctx); if (blocked(p.id, d.id)) return;
  pkTarget = { pid: p.id, did: d.id }; pk = { q: '', eq: 'gym', mu: '' };
  ctx.sheet(`<button class="btn small close" data-a="close">Close</button><h2>Add exercise</h2>
    <input id="pk-q" class="pl-search" type="search" placeholder="Search RepDB…" autocomplete="off">
    <div id="pk-chips"></div><div id="pk-res"></div>
    <button class="btn big" data-a="p-pk-custom">Custom exercise (no picture)</button>`);
  pkRefresh();
  if (!ctx.DB) ctx.db().then(() => { pkRefresh(); if (!ctx.DB && document.getElementById('pk-res')) document.getElementById('pk-res').innerHTML = '<p class="muted">Exercise database unavailable (offline?). Add a custom exercise instead.</p>'; });
};
A['p-pk-eq'] = (t) => { pk.eq = t.dataset.v; pkRefresh(); };
A['p-pk-mu'] = (t) => { pk.mu = t.dataset.v; pkRefresh(); };
const addEx = (ctx, ex) => {
  const p = getPlan(pkTarget.pid), d = getDay(p, pkTarget.did);
  if (!d || blocked(p.id, d.id)) return;
  ex.id = ctx.L.uniqueId(`${d.id.toLowerCase()}-${d.exercises.length + 1}`, p.days.flatMap((z) => z.exercises.map((e) => e.id)));
  d.exercises.push(ex); touch(p);
  ctx.closeSheet(() => { ctx.toast('Exercise added'); fresh(); });
};
const blank = (name) => ({ name, repdbId: null, repdbImageId: null, alternatives: [], primary: [], warmup: '', sets: 2, repMin: 8, repMax: 12, rir: '0–1', restSec: 90, startKg: null, stepKg: 2.5, noteTh: '' });
A['p-pk-pick'] = (t, ctx) => {
  ctxRef = ctx;
  const e = ctx.DB?.get(t.dataset.id); if (!e) return;
  const ex = blank(e.name_en);
  ex.repdbId = e.id; ex.repdbImageId = e.id;
  ex.primary = [...new Set((e.primary_muscles || []).map(muName))];
  ex.alternatives = ctx.L.pickAlternatives([...ctx.DB.values()], e, gymOk, 3);
  addEx(ctx, ex);
};
A['p-pk-custom'] = (t, ctx) => addEx((ctxRef = ctx), blank('New exercise'));
export function onInput(ev, ctx) {
  ctxRef = ctx;
  if (ev.target.id === 'pk-q') { pk.q = ev.target.value; pkRefresh(); }
}

// ----- export -----
const cleanPlan = (p) => { const c = JSON.parse(JSON.stringify(p)); delete c.id; delete c.source; delete c.modified; return c; };
export function buildPrompt(planJson) {
  return `You are my strength coach. Below is my current training plan as JSON. Revise it as I ask and return ONLY the revised plan as a single JSON object in exactly the same schema, with no commentary and no markdown.

ABOUT ME
- Goal: hypertrophy, chest is the priority (especially upper chest).
- Each exercise: 2 hard working sets taken to failure (RIR 0-1) after warm-ups. Simplicity beats setup: no barbell lifts, no dips, no face pulls, nothing that needs a lot of setting up.
- My gym is machine-heavy: machines, cables, Smith machine, dumbbells, leg press, hack squat.

SCHEMA (all keys required unless marked optional)
{
  "version": 1,
  "name": "Plan name",
  "nutrition": { "kcal": 2750, "proteinG": 130, "note": "free text" },
  "rotation": ["dayId", "..."],            // order the days are trained; every entry must be a day id
  "days": [{
    "id": "UA",                             // unique day id
    "name": "Upper A", "nameTh": "Thai name", "focus": "short focus text",
    "exercises": [{
      "id": "ua-1",                         // unique across the WHOLE plan
      "name": "Exercise name",              // my training history is matched by this name, keep names unless a change is requested
      "repdbId": "incline-db-press" | null, // id from https://exercise-dataset.com/exercises.json
      "repdbImageId": "incline-db-press" | null, // RepDB id used only for the picture
      "alternatives": ["id", "id", "id"],   // up to 3 RepDB ids of similar exercises I can swap in
      "primary": ["upper chest"],           // readable muscle names
      "warmup": "2-3 ramp sets ...",
      "sets": 2, "repMin": 8, "repMax": 12, // repMin <= repMax, sets >= 1
      "rir": "0-1",                         // string
      "restSec": 90, "startKg": 30, "stepKg": 2.5,
      "perSide": true,                      // optional: weight is per side / per dumbbell
      "supersetWith": "ua-2",               // optional: id of another exercise in the SAME day (set on both)
      "noteTh": "Thai coaching cues"
    }]
  }]
}

RULES
- Use only real RepDB ids from https://exercise-dataset.com/exercises.json for repdbId, repdbImageId and alternatives (or null).
- Keep ids unique, keep the JSON valid, and answer with the JSON only.

MY CURRENT PLAN
${planJson}
`;
}
const copyText = async (ctx, text, what) => {
  const ta = document.getElementById('p-out');
  if (ta) { ta.value = text; ta.hidden = false; }
  try { await navigator.clipboard.writeText(text); ctx.toast(`${what} copied`); }
  catch { if (ta) { ta.focus(); ta.select(); } ctx.toast('Select the text and copy it'); }
};
A['p-export'] = (t, ctx) => {
  ctxRef = ctx; exportPid = t.dataset.id;
  ctx.sheet(`<button class="btn small close" data-a="close">Close</button><h2>Export plan</h2>
    <p class="muted">Copy the plan, or a prompt you can paste into an LLM / coach to redesign it.</p>
    <button class="btn big" data-a="p-copy-json">Copy plan JSON</button>
    <button class="btn big primary" data-a="p-copy-prompt">Copy LLM prompt</button>
    <textarea id="p-out" class="pl-ta" rows="8" readonly hidden></textarea>`);
};
A['p-copy-json'] = (t, ctx) => copyText(ctx, JSON.stringify(cleanPlan(getPlan(exportPid)), null, 1), 'Plan JSON');
A['p-copy-prompt'] = (t, ctx) => copyText(ctx, buildPrompt(JSON.stringify(cleanPlan(getPlan(exportPid)), null, 1)), 'Prompt');

// ----- import -----
A['p-import'] = (t, ctx) => {
  ctxRef = ctx; imp = { target: t.dataset.id || S().activePlanId, plan: null };
  ctx.sheet(`<button class="btn small close" data-a="close">Close</button><h2>Paste plan JSON</h2>
    <textarea id="p-imp" class="pl-ta" rows="9" placeholder="Paste the plan here (code fences and extra text are fine)"></textarea>
    <button class="btn big primary" data-a="p-imp-check">Check</button><div id="p-imp-res"></div>`);
};
A['p-imp-check'] = async (t, ctx) => {
  ctxRef = ctx;
  const res = document.getElementById('p-imp-res'), obj = ctx.L.extractJson(document.getElementById('p-imp')?.value);
  imp.plan = null;
  if (!obj) { res.innerHTML = '<p class="warn-text">No JSON object found in the pasted text.</p>'; return; }
  await ctx.db();
  const r = ctx.L.validatePlan(obj, ctx.DB ? new Set(ctx.DB.keys()) : null);
  const li = (a, cls) => a.length ? `<ul class="${cls}">${a.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  let h = '';
  if (r.errors.length) h = `<p class="warn-text"><b>${r.errors.length} error(s), nothing imported:</b></p>${li(r.errors, 'pl-err')}`;
  if (r.warnings.length) h += `<p class="muted"><b>${r.warnings.length} fixed automatically:</b></p>${li(r.warnings, 'pl-warn')}`;
  if (!ctx.DB) h += '<p class="muted">RepDB unavailable — picture ids were not checked.</p>';
  if (!r.errors.length) {
    imp.plan = r.plan;
    const tp = getPlan(imp.target);
    h += `<p><b>${esc(r.plan.name)}</b> · ${r.plan.days.length} days · ${r.plan.days.reduce((n, d) => n + d.exercises.length, 0)} exercises</p>
      <button class="btn big primary" data-a="p-imp-new">Add as new plan</button>
      ${tp ? `<button class="btn big" data-a="p-imp-replace" ${busy(tp.id) ? 'disabled' : ''}>Replace '${esc(tp.name)}'</button>${busy(tp.id) ? '<p class="muted">Workout in progress on that plan.</p>' : ''}` : ''}`;
  }
  res.innerHTML = h;
};
A['p-imp-new'] = (t, ctx) => {
  ctxRef = ctx; const np = imp?.plan; if (!np) return;
  const id = ctx.L.slug(np.name, Object.keys(S().plans));
  const c = { ...np, id, modified: true }; delete c.source; c.version = Number(c.version) || 1;
  ctx.closeSheet(() => { S().plans[id] = c; S().rotation[id] = 0; ctx.save(); ctx.toast('Plan added'); ctx.nav(`#plan/edit/${id}`); });
};
A['p-imp-replace'] = (t, ctx) => {
  ctxRef = ctx; const np = imp?.plan, old = getPlan(imp?.target); if (!np || !old || blocked(old.id)) return;
  ctx.closeSheet(() => {
    const c = { ...np, id: old.id, modified: true, version: old.version };
    if (old.source) c.source = old.source; else delete c.source;
    S().plans[old.id] = c; S().rotation[old.id] = ctx.L.clampRotation(S().rotation[old.id] || 0, c);
    ctx.save(); ctx.toast('Plan replaced'); fresh();
  });
};

export const actions = A;
