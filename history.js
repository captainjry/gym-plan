// History tab. Contract: see MODS comment in app.js. Routes: #history, #history/s/<id>, #history/ex/<name>
const ms = (d) => new Date(d + 'T00:00:00').getTime();
const st = { month: null, q: '', shown: 15 }; // view state (month = {y, m})
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r1 = (x) => Math.round(x * 10) / 10;
const short = (d) => new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const mins = (s) => (s.finishedAt ? Math.max(1, Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 6e4)) : null);
const nSets = (s) => s.entries.reduce((n, x) => n + x.sets.length, 0);
const done = (S) => S.sessions.filter((s) => s.entries.some((x) => x.sets.length));
const planName = (S, id) => S.plans[id]?.name || id;
const back = '<button class="btn ghost small" data-a="back">‹ Back</button>';

// Inline SVG line chart. pts/line2: [{x, y}]; inv flips the y axis; xt: x tick labels [{x, t}]
function chart(pts, { line2 = [], inv = false, xt = [], unit = '' } = {}) {
  const W = 320, H = 160, l = 36, r = 8, t = 10, b = 22;
  const all = [...pts, ...line2];
  let x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
  let y0 = Math.min(...all.map((p) => p.y)), y1 = Math.max(...all.map((p) => p.y));
  if (x1 === x0) { x0 -= 1; x1 += 1; }
  const pad = (y1 - y0) * 0.12 || 1; y0 -= pad; y1 += pad;
  const X = (x) => l + ((x - x0) / (x1 - x0)) * (W - l - r);
  const Y = (y) => (inv ? t + ((y - y0) / (y1 - y0)) * (H - t - b) : H - b - ((y - y0) / (y1 - y0)) * (H - t - b));
  const path = (a) => a.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const grid = [0, 1, 2].map((i) => {
    const v = y0 + ((y1 - y0) * (i + 0.5)) / 3, y = Y(v).toFixed(1);
    return `<line x1="${l}" x2="${W - r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${l - 4}" y="${+y + 4}" text-anchor="end">${r1(v)}</text>`;
  }).join('');
  const xs = xt.map((k, i) => `<text x="${X(k.x).toFixed(1)}" y="${H - 6}" text-anchor="${xt.length > 1 ? (i ? 'end' : 'start') : 'middle'}">${k.t}</text>`).join('');
  const dots = pts.length <= 40 ? pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('') : '';
  const two = line2.length > 1 ? `<path d="${path(line2)}" fill="none" stroke="var(--warn)" stroke-width="2" stroke-linejoin="round"/>` : '';
  const one = pts.length > 1 ? `<path d="${path(pts)}" fill="none" stroke="var(--accent)" stroke-width="${line2.length ? 1.2 : 2.2}" stroke-linejoin="round" ${line2.length ? 'opacity=".6"' : ''}/>` : '';
  return `<svg class="hchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(unit)} chart">${grid}${xs}${one}${two}${dots}</svg>`;
}

function empty(msg = 'No workouts logged yet.') {
  return `<section class="card center hempty"><p>${msg}</p><p class="muted">Finish a workout and it shows up here with your streak, records and trends.</p><a class="btn primary" href="#today">Go to Today</a></section>`;
}

function weekCard(S, L) {
  const w = L.weekInfo(S.sessions), streak = L.weekStreak(S.sessions);
  const dots = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((n, i) => `<span class="hd${w.days[i] ? ' on' : ''}${i === w.today ? ' now' : ''}"><i></i>${n}</span>`).join('');
  return `<section class="card"><h3 style="margin-top:0">This week</h3><div class="hweek">${dots}</div>
    <div class="stats"><div><b>${w.count}</b><span>session${w.count === 1 ? '' : 's'}</span></div><div><b>${streak}</b><span>week streak</span></div></div></section>`;
}

function calCard(S, L) {
  const now = new Date();
  const c = (st.month ||= { y: now.getFullYear(), m: now.getMonth() });
  const by = {};
  for (const s of done(S)) (by[L.ymd(new Date(s.startedAt))] ||= []).push(s);
  const lead = (new Date(c.y, c.m, 1).getDay() + 6) % 7, n = new Date(c.y, c.m + 1, 0).getDate();
  const today = L.ymd(now);
  let cells = '<span></span>'.repeat(lead);
  for (let d = 1; d <= n; d++) {
    const k = L.ymd(new Date(c.y, c.m, d)), ss = by[k];
    const cls = `hc${ss ? ' on' : ''}${k === today ? ' today' : ''}`;
    cells += ss ? `<button class="${cls}" data-a="h-open" data-id="${e(ss[ss.length - 1].id)}" aria-label="${k}">${d}</button>` : `<span class="${cls}">${d}</span>`;
  }
  return `<section class="card"><div class="hcalhead"><button class="btn small" data-a="h-month" data-d="-1" aria-label="Previous month">‹</button><b>${MON[c.m]} ${c.y}</b><button class="btn small" data-a="h-month" data-d="1" aria-label="Next month">›</button></div>
    <div class="hcal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<em>${x}</em>`).join('')}${cells}</div></section>`;
}

function sessionRow(s, S) {
  const m = mins(s);
  return `<li><button class="hrow" data-a="h-open" data-id="${e(s.id)}"><span class="hmain"><b>${e(s.dayName || 'Workout')}</b><span class="muted">${e(planName(S, s.planId))} · ${short(s.startedAt)}</span></span>
    <span class="muted hside">${s.entries.filter((x) => x.sets.length).length} ex · ${nSets(s)} sets${m ? ` · ${m} min` : ''}</span></button></li>`;
}

const fmtRec = (kind, s, L) => (kind === 'a' ? `assist ${-s.kg} × ${s.reps}` : L.fmtSet(s));

function bwCard(S, L, ctx) {
  const list = [...(S.bodyweight || [])].filter((x) => x && x.date && typeof x.kg === 'number').sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = list[list.length - 1];
  const cutoff = last ? ms(last.date) - 90 * 864e5 : 0;
  const rec = list.filter((x) => ms(x.date) >= cutoff);
  const avg = L.movingAvg(list).filter((x) => ms(x.date) >= cutoff);
  const ch = L.change30(list), nut = ctx.plan()?.nutrition;
  const pt = (a) => a.map((x) => ({ x: ms(x.date) / 864e5, y: x.kg }));
  const ticks = rec.length > 1 ? [{ x: ms(rec[0].date) / 864e5, t: short(rec[0].date) }, { x: ms(last.date) / 864e5, t: short(last.date) }] : [];
  return `<section class="card" id="h-bw"><h3 style="margin-top:0">Bodyweight</h3>
    <div class="hbwin"><input id="h-bwkg" type="text" inputmode="decimal" placeholder="${last ? last.kg.toFixed(1) : '0.0'}" aria-label="Bodyweight kg" autocomplete="off"><span class="muted">kg</span><button class="btn primary" data-a="h-bwlog">Log</button></div>
    ${last ? `<div class="stats"><div><b>${last.kg.toFixed(1)}</b><span>latest kg</span></div><div><b>${ch == null ? '–' : (ch > 0 ? '+' : '') + ch.toFixed(1)}</b><span>30-day change</span></div></div>
      ${rec.length > 1 ? chart(pt(rec), { line2: pt(avg), xt: ticks, unit: 'bodyweight' }) + '<p class="muted hleg"><i class="a"></i>entries <i class="b"></i>7-day average</p>' : ''}
      <ul class="hbwlist">${[...list].reverse().slice(0, 8).map((x) => `<li><button class="hrow" data-a="h-bwdel" data-d="${e(x.date)}"><span>${short(x.date)}</span><b>${x.kg.toFixed(1)} kg</b></button></li>`).join('')}</ul>
      <p class="muted">Tap an entry to delete it.</p>` : '<p class="muted">Log your weight to see a trend.</p>'}
    ${nut ? `<p class="muted hnut">Plan target: ${e(nut.kcal)} kcal · ${e(nut.proteinG)} g protein a day</p>` : ''}</section>`;
}

function main(ctx) {
  const { S, L } = ctx;
  const ss = done(S);
  const bw = bwCard(S, L, ctx);
  if (!ss.length) return `<h1 class="pad">History</h1>${empty()}${bw}`;
  const sorted = [...ss].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const recs = L.records(ss);
  const q = st.q.trim().toLowerCase();
  return `<h1 class="pad">History</h1><div class="cols"><div class="c1">${weekCard(S, L)}${calCard(S, L)}</div><div class="c2">
    <h3 class="pad">Sessions</h3><ul class="hlist">${sorted.slice(0, st.shown).map((s) => sessionRow(s, S)).join('')}</ul>
    ${sorted.length > st.shown ? `<button class="btn ghost" style="width:100%" data-a="h-more">Show more (${sorted.length - st.shown})</button>` : ''}
    <h3 class="pad">Exercises</h3>
    <input id="h-q" class="hsearch" type="search" placeholder="Search exercises" value="${e(st.q)}" autocomplete="off">
    <ul class="hlist" id="h-exlist">${recs.map((r) => `<li data-n="${e(r.name.toLowerCase())}"${q && !r.name.toLowerCase().includes(q) ? ' hidden' : ''}><button class="hrow" data-a="h-ex" data-n="${e(encodeURIComponent(r.name))}"><span class="hmain"><b>${e(r.name)}</b></span><span class="muted hside">${fmtRec(r.kind, r.heaviest, L)}</span></button></li>`).join('')}</ul>
    <details class="card hrec"><summary>Records</summary><ul class="hlist">${recs.map((r) => `<li class="hrecrow"><b>${e(r.name)}</b><span>${r.kind === 'w' ? 'Heaviest' : 'Best'} ${fmtRec(r.kind, r.heaviest, L)}</span>${r.e1rm ? `<span>e1RM ${Math.round(L.e1rm(r.e1rm.kg, r.e1rm.reps) * 10) / 10} kg</span>` : ''}<span class="muted">${short(r.date)}</span></li>`).join('')}</ul></details></div>
    ${bw}</div>`;
}

function sessionView(ctx, id) {
  const { S, L } = ctx;
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return `<div class="pad">${back}</div>${empty('That session no longer exists.')}`;
  const pr = L.prMap(S.sessions), m = mins(s);
  const exs = s.entries.map((en, ei) => (en.sets.length ? `<section class="card"><button class="hrow hexhead" data-a="h-ex" data-n="${e(encodeURIComponent(en.name))}"><b>${e(en.name)}</b><span class="muted">history ›</span></button>
    <ol class="hsets">${en.sets.map((x, si) => `<li>${L.fmtSet(x)}${pr.has(`${s.id}|${ei}|${si}`) ? ' <span class="tag">PR</span>' : ''}</li>`).join('')}</ol></section>` : '')).join('');
  return `<div class="pad">${back}</div><h1 class="pad">${e(s.dayName || 'Workout')}</h1>
    <p class="muted pad">${e(planName(S, s.planId))} · ${ctx.fmtDate(s.startedAt)}${m ? ` · ${m} min` : ''} · ${nSets(s)} sets</p>${exs}
    <button class="btn danger-text" data-a="h-delsession" data-id="${e(s.id)}">Delete session</button>`;
}

function exView(ctx, name) {
  const { S, L } = ctx;
  const h = L.exHistory(S.sessions, name);
  if (!h.length) return `<div class="pad">${back}</div>${empty('No sets logged for this exercise.')}`;
  const lastH = h[h.length - 1];
  const shown = lastH.session.entries.find((x) => L.exKey(x.name) === L.exKey(name)).name;
  const kind = L.kindOf(lastH.sets[lastH.sets.length - 1].kg);
  const all = h.flatMap((x) => x.sets).filter((x) => L.kindOf(x.kg) === kind);
  const best = L.bestSet(all);
  const est = kind === 'w' ? Math.max(...all.map((x) => L.e1rm(x.kg, x.reps))) : null;
  const pts = h.filter((x) => L.kindOf(x.sets[x.sets.length - 1].kg) === kind).map((x, i) => ({ x: i, y: L.chartValue(x.sets) }));
  const lab = kind === 'w' ? 'Estimated 1RM (kg)' : kind === 'a' ? 'Assistance kg (lower = stronger)' : 'Best reps per session';
  const xt = pts.length > 1 ? [{ x: 0, t: short(h[0].session.startedAt) }, { x: pts.length - 1, t: short(lastH.session.startedAt) }] : [{ x: 0, t: short(h[0].session.startedAt) }];
  const rows = [...h].reverse().map((x) => `<tr><td><button class="hlink" data-a="h-open" data-id="${e(x.session.id)}">${short(x.session.startedAt)}</button></td><td>${x.sets.map((s) => L.fmtSet(s)).join(', ')}</td></tr>`).join('');
  const big = kind === 'a' ? -best.kg : kind === 'w' ? best.kg : best.reps;
  return `<div class="pad">${back}</div><h1 class="pad">${e(shown)}</h1>
    <div class="stats"><div><b>${big}</b><span>${kind === 'a' ? `best assist kg × ${best.reps}` : kind === 'w' ? `best set kg × ${best.reps}` : 'best reps'}</span></div>
    ${est != null ? `<div><b>${Math.round(est * 10) / 10}</b><span>est. 1RM kg</span></div>` : `<div><b>${h.length}</b><span>sessions</span></div>`}</div>
    <section class="card"><p class="muted" style="margin-top:0">${lab}</p>${chart(pts, { inv: kind === 'a', xt, unit: lab })}</section>
    <section class="card"><table class="htable"><tbody>${rows}</tbody></table></section>`;
}

export function render(ctx) {
  const [, sub, arg] = ctx.parts();
  const a = arg ? decodeURIComponent(arg) : '';
  if (sub === 's') return sessionView(ctx, a);
  if (sub === 'ex') return exView(ctx, a);
  return main(ctx);
}

export function onInput(ev) {
  if (ev.target.id !== 'h-q') return;
  st.q = ev.target.value;
  const q = st.q.trim().toLowerCase();
  document.querySelectorAll('#h-exlist li').forEach((li) => (li.hidden = !!q && !li.dataset.n.includes(q)));
}

export const actions = {
  'h-open': (el, ctx) => ctx.nav(`#history/s/${encodeURIComponent(el.dataset.id)}`),
  'h-ex': (el, ctx) => ctx.nav(`#history/ex/${el.dataset.n}`),
  'h-more': (el, ctx) => { st.shown += 15; ctx.rerender(); },
  'h-month': (el, ctx) => {
    const c = st.month, d = new Date(c.y, c.m + +el.dataset.d, 1);
    st.month = { y: d.getFullYear(), m: d.getMonth() };
    ctx.rerender();
  },
  'h-delsession': (el, ctx) => {
    const id = el.dataset.id;
    ctx.ask('Delete this session and all its sets? This cannot be undone.', 'Delete', () => {
      ctx.S.sessions = ctx.S.sessions.filter((s) => s.id !== id);
      ctx.save();
      ctx.toast('Session deleted');
      ctx.nav('#history', { replace: true, dir: 'back' });
    });
  },
  'h-bwlog': (el, ctx) => {
    const kg = Number(document.getElementById('h-bwkg').value.replace(',', '.'));
    if (!(kg >= 20 && kg <= 400)) return ctx.toast('Enter your weight in kg, e.g. 72.5');
    ctx.S.bodyweight = ctx.L.logBodyweight(ctx.S.bodyweight || [], ctx.L.ymd(), Math.round(kg * 10) / 10);
    ctx.save();
    ctx.toast('Logged');
    ctx.rerender();
  },
  'h-bwdel': (el, ctx) => {
    const d = el.dataset.d;
    ctx.ask(`Delete the bodyweight entry for ${short(d)}?`, 'Delete', () => {
      ctx.S.bodyweight = ctx.S.bodyweight.filter((x) => x.date !== d);
      ctx.save();
      ctx.rerender();
    });
  },
};
