// Pure logic — no DOM, no storage. Tested by ../test_logic.mjs

const r2 = (x) => Math.round(x * 100) / 100;
export const exKey = (name) => String(name || '').trim().toLowerCase();

// Rotation: index into plan.rotation (array of day ids)
export function nextDayId(plan, index) {
  const n = plan.rotation.length;
  return plan.rotation[(((index | 0) % n) + n) % n];
}
export function advanceRotation(plan, dayId, index) {
  const i = plan.rotation.indexOf(dayId);
  return i < 0 ? index | 0 : (i + 1) % plan.rotation.length;
}

// Most recent finished session's sets for the same exercise (matched by name)
export function lastSetsFor(sessions, name) {
  const k = exKey(name);
  for (let i = sessions.length - 1; i >= 0; i--) {
    const e = sessions[i].entries.find((x) => exKey(x.name) === k && x.sets.length);
    if (e) return e.sets;
  }
  return [];
}
export function lastSessionFor(sessions, planId, dayId) {
  for (let i = sessions.length - 1; i >= 0; i--)
    if (sessions[i].planId === planId && sessions[i].dayId === dayId) return sessions[i];
  return null;
}

// Double progression: every logged set at the same kg hit >= repMax → suggest kg + step
export function progression(ex, lastSets) {
  if (!lastSets.length || ex.stepKg == null) return null;
  const kg = lastSets[0].kg;
  if (kg == null || !lastSets.every((s) => s.kg === kg && s.reps >= ex.repMax)) return null;
  return r2(kg + ex.stepKg);
}

// Prefill for the next set of this exercise. ex.nextKg (set from Today) beats last time and the ↑ hint for set 1.
export function prefill(ex, lastSets, curSets) {
  const i = curSets.length;
  const up = progression(ex, lastSets);
  const prev = curSets[i - 1];
  const last = lastSets[i] || lastSets[lastSets.length - 1];
  const kg = prev ? prev.kg : ex.nextKg ?? up ?? last?.kg ?? ex.startKg ?? null;
  const reps = up != null ? ex.repMin : last?.reps ?? prev?.reps ?? ex.repMin;
  return { kg, reps };
}

// What the player would prefill for set 1 ignoring any override (seed for the "Next session kg" input)
export const defaultNextKg = (ex, lastSets) => prefill({ ...ex, nextKg: null }, lastSets, []).kg;
// Carry nextKg notes (by exercise id) from an old plan onto a replacement plan (mutates and returns newPlan)
export function carryNextKg(oldPlan, newPlan) {
  const m = new Map();
  for (const d of oldPlan?.days || []) for (const x of d.exercises) if (x.nextKg != null) m.set(x.id, x.nextKg);
  for (const d of newPlan.days) for (const x of d.exercises) if (m.has(x.id)) x.nextKg = m.get(x.id);
  return newPlan;
}

// A set is a new best if no earlier set of the same exercise had >= kg AND >= reps.
// Returns [{name, set}] (the single best new set per exercise); exercises without history are skipped.
export function sessionBests(entries, sessions) {
  const out = [];
  for (const e of entries) {
    const k = exKey(e.name);
    const prior = sessions.flatMap((s) => s.entries.filter((x) => exKey(x.name) === k).flatMap((x) => x.sets));
    if (!prior.length || !e.sets.length) continue;
    const fresh = e.sets.filter((s) => !prior.some((p) => (p.kg ?? 0) >= (s.kg ?? 0) && p.reps >= s.reps));
    if (!fresh.length) continue;
    fresh.sort((a, b) => (b.kg ?? 0) - (a.kg ?? 0) || b.reps - a.reps);
    out.push({ name: e.name, set: fresh[0] });
  }
  return out;
}

// Workout flow
const open = (e) => !e.done && !e.skipped;
export function partnerIndex(exs, i) {
  const id = exs[i]?.supersetWith;
  return id ? exs.findIndex((x) => x.id === id) : -1;
}
export function nextOpen(entries, from) {
  const n = entries.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (open(entries[j])) return j;
  }
  return -1;
}
// Called after a set was pushed to entries[i] (and its done flag updated).
// Superset A/B: A set → B set (no rest) → rest → A set …
export function afterSet(exs, entries, i) {
  const p = partnerIndex(exs, i);
  const e = entries[i];
  const pe = entries[p];
  if (pe && open(pe) && pe.sets.length < e.sets.length) return { next: p, rest: false };
  const group = p >= 0 ? [Math.min(i, p), Math.max(i, p)] : [i];
  const g = group.find((j) => open(entries[j]));
  if (g != null) return { next: g, rest: true };
  const n = nextOpen(entries, i);
  return n < 0 ? { next: i, rest: false } : { next: n, rest: true };
}

// Formatting
export const isAssist = (kg) => kg != null && kg < 0;
export function fmtKg(kg) {
  if (kg == null) return 'BW';
  return kg < 0 ? `${r2(-kg)} assist` : `${r2(kg)}`;
}
export const fmtSet = (s) => `${fmtKg(s.kg)} × ${s.reps}`;
export const fmtTarget = (ex) =>
  `${ex.sets} × ${ex.repMin}–${ex.repMax} · RIR ${ex.rir} · rest ${ex.restSec} s`;
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Backup validation → error string, or null when valid
export function validateBackup(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'Not a backup object';
  if (o.version !== 1) return 'Unknown backup version';
  if (!Array.isArray(o.sessions)) return 'Missing sessions list';
  for (const s of o.sessions) {
    if (!s || typeof s.id !== 'string' || typeof s.planId !== 'string' || !Array.isArray(s.entries))
      return 'A session is malformed';
    for (const e of s.entries)
      if (!e || typeof e.name !== 'string' || !Array.isArray(e.sets) || e.sets.some((x) => typeof x?.reps !== 'number'))
        return `Session ${s.id} has a malformed entry`;
  }
  if (o.plans != null) {
    if (typeof o.plans !== 'object') return 'Plans are malformed';
    for (const p of Object.values(o.plans))
      if (!Array.isArray(p?.days) || !Array.isArray(p?.rotation)) return 'A plan is malformed';
  }
  if (o.rotation != null && typeof o.rotation !== 'object') return 'Rotation is malformed';
  if (o.bodyweight != null && !Array.isArray(o.bodyweight)) return 'Bodyweight is malformed';
  return null;
}

// Plan updates: shipped default is newer than the stored copy and the user hasn't dismissed that version
export function planUpdateAvailable(stored, fetched, dismissed) {
  const v = Number(fetched?.version) || 0;
  return v > (Number(stored?.version) || 0) && v !== dismissed;
}
export function clampRotation(index, plan) {
  const n = plan.rotation.length;
  return n && index >= 0 && index < n ? index | 0 : 0;
}

// "This week": Mon–Sun (local time) dots for the week containing `now`; count = finished sessions in that week
export function weekDots(sessions, now = new Date()) {
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, k) => ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k)));
  const done = days.map(() => 0);
  for (const s of sessions) {
    const k = days.indexOf(ymd(new Date(s.finishedAt || s.startedAt)));
    if (k >= 0) done[k]++;
  }
  return { days: done.map((n) => n > 0), count: done.reduce((a, b) => a + b, 0), today: (now.getDay() + 6) % 7 };
}

// Entries may outnumber plan exercises after a mid-exercise swap (old entry stays, new one follows with the same slotId).
// Returns the plan exercises aligned to entries; a superseded entry gets a distinct id and no superset link,
// so partnerIndex/afterSet pair the superset with the live entry of the slot.
export function alignedExs(exs, entries) {
  return entries.map((e, i) => {
    const x = exs.find((q) => q.id === e.slotId) || exs[i];
    const old = entries.findLastIndex((q) => q.slotId === e.slotId) !== i;
    return old ? { ...x, id: x.id + '#old', supersetWith: undefined } : x;
  });
}
// Insert a fresh entry for the swapped exercise right after entry i (which is closed as-is).
export function splitEntry(entries, i, repdbId, name, swapped) {
  const e = entries[i];
  e.done = true;
  entries.splice(i + 1, 0, { slotId: e.slotId, repdbId, name, swapped, sets: [], done: false, skipped: false });
  return i + 1;
}
export function shortName(name, n = 2) { return String(name || '').trim().split(/\s+/).slice(0, n).join(' '); }

// ---------- History: PRs, e1RM, weeks, streak, bodyweight ----------
// kg > 0 weighted, kg < 0 assisted machine (magnitude = assistance), null/0 bodyweight
export const kindOf = (kg) => (kg > 0 ? 'w' : kg < 0 ? 'a' : 'b');
export const e1rm = (kg, reps) => (kg > 0 ? r2(kg * (1 + reps / 30)) : null);
// true when set a beats set b (same kind only)
export function beats(a, b) {
  const k = kindOf(a.kg);
  if (k !== kindOf(b.kg)) return false;
  if (k === 'w') return e1rm(a.kg, a.reps) > e1rm(b.kg, b.reps);
  if (k === 'a') {
    const x = -a.kg, y = -b.kg;
    return (x < y && a.reps >= b.reps) || (x === y && a.reps > b.reps);
  }
  return a.reps > b.reps;
}
// Best set of a list under the PR rules (first of the best kind = kind of the last set)
export function bestSet(sets) {
  if (!sets.length) return null;
  const k = kindOf(sets[sets.length - 1].kg);
  let best = null;
  for (const s of sets) if (kindOf(s.kg) === k && (!best || beats(s, best) || (!beats(best, s) && k === 'a' && -s.kg < -best.kg))) best = s;
  return best;
}
const byTime = (sessions) => [...sessions].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
// Set of "sessionId|entryIdx|setIdx" for sets that were a PR when logged. First time an exercise appears is not a PR.
export function prMap(sessions) {
  const seen = new Map(); // exKey → sets so far
  const out = new Set();
  for (const s of byTime(sessions)) {
    const added = [];
    s.entries.forEach((e, ei) => {
      const k = exKey(e.name);
      const prior = seen.get(k) || [];
      e.sets.forEach((set, si) => {
        const same = [...prior, ...added.filter((x) => x.k === k).map((x) => x.set)].filter((p) => kindOf(p.kg) === kindOf(set.kg));
        if (prior.length && same.length && same.every((p) => beats(set, p))) out.add(`${s.id}|${ei}|${si}`);
        else if (prior.length && !same.length) out.add(`${s.id}|${ei}|${si}`);
        added.push({ k, set });
      });
    });
    for (const a of added) seen.set(a.k, [...(seen.get(a.k) || []), a.set]);
  }
  return out;
}
// Per-exercise timeline oldest → newest: [{session, sets, best}]
export function exHistory(sessions, name) {
  const k = exKey(name);
  const out = [];
  for (const s of byTime(sessions)) {
    const sets = s.entries.filter((e) => exKey(e.name) === k).flatMap((e) => e.sets);
    if (sets.length) out.push({ session: s, sets, best: bestSet(sets) });
  }
  return out;
}
// Chart value of one session: weighted → best e1RM, assisted → least assistance, bodyweight → most reps
export function chartValue(sets) {
  const k = kindOf(sets[sets.length - 1].kg);
  const xs = sets.filter((s) => kindOf(s.kg) === k);
  return k === 'w' ? Math.max(...xs.map((s) => e1rm(s.kg, s.reps))) : k === 'a' ? Math.min(...xs.map((s) => -s.kg)) : Math.max(...xs.map((s) => s.reps));
}
// Records: [{name, kind, heaviest, e1rm, date}] most recently trained first
export function records(sessions) {
  const m = new Map();
  for (const s of byTime(sessions))
    for (const e of s.entries) {
      if (!e.sets.length) continue;
      const k = exKey(e.name);
      const r = m.get(k) || { name: e.name, sets: [] };
      r.name = e.name; r.last = s.startedAt;
      r.sets.push(...e.sets.map((x) => ({ ...x, date: s.startedAt })));
      m.set(k, r);
    }
  return [...m.values()].map((r) => {
    const kind = kindOf(r.sets[r.sets.length - 1].kg);
    const xs = r.sets.filter((x) => kindOf(x.kg) === kind);
    const best = bestSet(xs);
    const heavy = kind === 'w' ? xs.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a)) : best;
    return { name: r.name, kind, heaviest: heavy, e1rm: kind === 'w' ? best : null, date: best.date, last: r.last };
  }).sort((a, b) => (a.last < b.last ? 1 : -1));
}
// Weeks (Mon-first). All dates are local.
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function weekInfo(sessions, now = new Date()) {
  const ws = weekStart(now);
  const days = Array(7).fill(false);
  let count = 0;
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    const i = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - ws) / 864e5);
    if (i >= 0 && i < 7) { days[i] = true; count++; }
  }
  return { days, count, today: (now.getDay() + 6) % 7 };
}
export function weekStreak(sessions, now = new Date()) {
  const weeks = new Set(sessions.map((s) => ymd(weekStart(new Date(s.startedAt)))));
  const w = weekStart(now);
  if (!weeks.has(ymd(w))) w.setDate(w.getDate() - 7);
  let n = 0;
  while (weeks.has(ymd(w))) { n++; w.setDate(w.getDate() - 7); }
  return n;
}
// Bodyweight: one entry per date, sorted
export function logBodyweight(list, date, kg) {
  return [...list.filter((x) => x.date !== date), { date, kg: r2(kg) }].sort((a, b) => (a.date < b.date ? -1 : 1));
}
// 7-day trailing average per entry (window = entries dated within the 7 days up to and including it)
export function movingAvg(list, days = 7) {
  const t = (s) => new Date(s + 'T00:00:00').getTime();
  return list.map((e) => {
    const w = list.filter((x) => t(x.date) <= t(e.date) && t(e.date) - t(x.date) < days * 864e5);
    return { date: e.date, kg: r2(w.reduce((a, x) => a + x.kg, 0) / w.length) };
  });
}
// Change since ~30 days before the latest entry (falls back to the oldest entry in that window); null with < 2 entries
export function change30(list) {
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const cut = ymd(new Date(new Date(last.date + 'T00:00:00').getTime() - 30 * 864e5));
  const ref = [...list].reverse().find((x) => x.date <= cut) || list.find((x) => x.date >= cut);
  return ref === last ? null : r2(last.kg - ref.kg);
}

// ---------- Plan editor helpers ----------
export function slug(name, taken = []) {
  const base = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
  const t = new Set(taken);
  let id = base, n = 2;
  while (t.has(id)) id = `${base}-${n++}`;
  return id;
}
// Move arr[i] by dir (-1/+1) in place; returns true if moved
export function moveItem(arr, i, dir) {
  const j = i + dir;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}
// First {...} block of pasted text (tolerates ```json fences and prose); string-aware brace matching. → parsed object or null
export function extractJson(text) {
  const s = String(text || '');
  for (let a = s.indexOf('{'); a >= 0; a = s.indexOf('{', a + 1)) {
    let depth = 0, str = false;
    for (let i = a; i < s.length; i++) {
      const c = s[i];
      if (str) { if (c === '\\') i++; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(s.slice(a, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}
// Mirrors check_plan.py. dbIds: Set of RepDB ids or null (not loaded → id checks skipped).
// → { errors, warnings, plan } where plan is a normalised deep copy (unknown ids nulled, duplicate ex ids suffixed)
export function validatePlan(input, dbIds = null) {
  const errors = [], warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['Not a plan object'], warnings, plan: null };
  const plan = JSON.parse(JSON.stringify(input));
  if (typeof plan.name !== 'string' || !plan.name.trim()) errors.push('Missing plan name');
  if (!Array.isArray(plan.days) || !plan.days.length) { errors.push('Missing days list'); return { errors, warnings, plan }; }
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  const known = (id) => !dbIds || dbIds.has(id);
  const seenDay = new Set(), seenEx = new Set();
  for (const day of plan.days) {
    if (!day || typeof day !== 'object' || typeof day.id !== 'string' || !day.id) { errors.push('A day has no id'); continue; }
    if (seenDay.has(day.id)) errors.push(`Duplicate day id '${day.id}'`);
    seenDay.add(day.id);
    if (typeof day.name !== 'string' || !day.name) errors.push(`Day ${day.id}: missing name`);
    day.nameTh ??= ''; day.focus ??= '';
    if (!Array.isArray(day.exercises)) { errors.push(`Day ${day.id}: missing exercises list`); continue; }
    const dayIds = new Set(day.exercises.map((x) => x?.id));
    for (const ex of day.exercises) {
      if (!ex || typeof ex !== 'object' || typeof ex.id !== 'string' || !ex.id) { errors.push(`Day ${day.id}: an exercise has no id`); continue; }
      const loc = `${day.id}/${ex.id}`;
      if (seenEx.has(ex.id)) {
        let n = 2; while (seenEx.has(`${ex.id}-${n}`) || dayIds.has(`${ex.id}-${n}`)) n++;
        warnings.push(`${loc}: duplicate exercise id, renamed to '${ex.id}-${n}'`);
        ex.id = `${ex.id}-${n}`;
      }
      seenEx.add(ex.id);
      if (typeof ex.name !== 'string' || !ex.name.trim()) errors.push(`${loc}: missing name`);
      ex.sets = num(ex.sets); ex.repMin = num(ex.repMin); ex.repMax = num(ex.repMax);
      if (!(ex.sets >= 1)) errors.push(`${loc}: sets must be >= 1`);
      if (!Number.isFinite(ex.repMin) || !Number.isFinite(ex.repMax)) errors.push(`${loc}: repMin/repMax must be numbers`);
      else if (ex.repMin > ex.repMax) errors.push(`${loc}: repMin ${ex.repMin} > repMax ${ex.repMax}`);
      ex.restSec = Number.isFinite(num(ex.restSec)) ? num(ex.restSec) : 90;
      ex.startKg = Number.isFinite(num(ex.startKg)) ? num(ex.startKg) : null;
      ex.stepKg = Number.isFinite(num(ex.stepKg)) ? num(ex.stepKg) : null;
      ex.rir = ex.rir == null ? '0–1' : String(ex.rir);
      ex.warmup ??= ''; ex.noteTh ??= '';
      ex.primary = Array.isArray(ex.primary) ? ex.primary : [];
      for (const k of ['repdbId', 'repdbImageId']) {
        if (ex[k] == null) { ex[k] = null; continue; }
        if (!known(ex[k])) { warnings.push(`${loc}: ${k} '${ex[k]}' not found in RepDB, cleared`); ex[k] = null; }
      }
      ex.alternatives = (Array.isArray(ex.alternatives) ? ex.alternatives : []).filter((a) => {
        if (known(a)) return true;
        warnings.push(`${loc}: alternative '${a}' not found in RepDB, removed`); return false;
      });
      if (ex.supersetWith != null && !dayIds.has(ex.supersetWith)) errors.push(`${loc}: supersetWith '${ex.supersetWith}' not a valid exercise id in day ${day.id}`);
      if (ex.supersetWith == null) delete ex.supersetWith;
    }
  }
  const dayList = plan.days.map((d) => d?.id).filter(Boolean);
  if (!Array.isArray(plan.rotation) || !plan.rotation.length) { plan.rotation = dayList; warnings.push('No rotation given, using day order'); }
  else if (plan.rotation.some((r) => !dayList.includes(r))) { plan.rotation = plan.rotation.filter((r) => dayList.includes(r)); warnings.push('Rotation had unknown day ids, removed'); if (!plan.rotation.length) plan.rotation = dayList; }
  return { errors, warnings, plan };
}
// Up to n RepDB ids sharing a primary muscle with `target` (a RepDB entry), allowed equipment only. exercises: RepDB array.
export function pickAlternatives(exercises, target, allowed, n = 3, skip = []) {
  if (!target) return [];
  const mus = new Set(target.primary_muscles || []);
  const skipSet = new Set([target.id, ...skip]);
  return exercises
    .filter((e) => !skipSet.has(e.id) && allowed(e) && (e.primary_muscles || []).some((m) => mus.has(m)))
    .map((e) => ({ id: e.id, s: (e.primary_muscles || []).filter((m) => mus.has(m)).length * 2 + (e.primary_muscles?.[0] === target.primary_muscles?.[0] ? 3 : 0) + (e.equipment === target.equipment ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
    .slice(0, n).map((x) => x.id);
}
// Unique id within taken (Set/array): base, base-2, ...
export function uniqueId(base, taken) {
  const t = new Set(taken); let id = base, n = 2;
  while (t.has(id)) id = `${base}-${n++}`;
  return id;
}

// ---------- Explore: RepDB muscle ids → tappable body-map regions ----------
// tag = the label the shipped plans use in exercise.primary
export const REGIONS = [
  { id: 'upperchest', name: 'Upper chest', tag: 'upper chest', desc: 'Upper (clavicular) pec fibres. Raises the arm forward and up — incline presses and low-to-high flyes.' },
  { id: 'chest', name: 'Chest', tag: 'chest', desc: 'Pectoralis major. Pushes the arms forward and pulls them across the body — presses, dips and flyes.' },
  { id: 'frontdelts', name: 'Front delts', tag: 'front delts', desc: 'Front of the shoulder. Raises the arm forward and overhead; works hard in every press.' },
  { id: 'sidedelts', name: 'Side delts', tag: 'side delts', desc: 'Outer shoulder. Lifts the arm out to the side and gives the shoulders their width.' },
  { id: 'reardelts', name: 'Rear delts', tag: 'rear delts', desc: 'Back of the shoulder. Pulls the arm back and rotates it out — rows, face pulls, reverse flyes.' },
  { id: 'biceps', name: 'Biceps', tag: 'biceps', desc: 'Biceps and brachialis. Bend the elbow and turn the palm up — curls and chin-ups.' },
  { id: 'triceps', name: 'Triceps', tag: 'triceps', desc: 'Back of the upper arm. Straightens the elbow — pushdowns, extensions, presses and dips.' },
  { id: 'forearms', name: 'Forearms', tag: 'forearms', desc: 'Wrist and finger flexors and extensors. Grip, wrist curls and elbow support when pulling.' },
  { id: 'abs', name: 'Abs', tag: 'abs', desc: 'Rectus and transverse abdominis. Flex and brace the trunk — crunches, leg raises, planks.' },
  { id: 'obliques', name: 'Obliques', tag: 'obliques', desc: 'Side of the waist (plus serratus). Rotate and side-bend the trunk and resist twisting.' },
  { id: 'hipflexors', name: 'Hip flexors', tag: 'hip flexors', desc: 'Front of the hip. Lift the knee toward the chest — leg raises, knee drives, sprints.' },
  { id: 'lats', name: 'Lats', tag: 'lats', desc: 'Latissimus dorsi. Pulls the arms down and back — pull-ups, pulldowns and rows.' },
  { id: 'upperback', name: 'Traps & mid back', tag: 'mid back', desc: 'Trapezius and rhomboids. Shrug, squeeze and hold the shoulder blades — rows and shrugs.' },
  { id: 'lowerback', name: 'Lower back', tag: 'lower back', desc: 'Spinal erectors. Keep the spine straight and extend the hips — hinges and back extensions.' },
  { id: 'glutes', name: 'Glutes', tag: 'glutes', desc: 'Gluteus maximus and medius. Extend and stabilise the hip — hip thrusts, squats, lunges.' },
  { id: 'quads', name: 'Quads', tag: 'quads', desc: 'Front of the thigh. Straighten the knee — squats, leg press, lunges, leg extensions.' },
  { id: 'hamstrings', name: 'Hamstrings', tag: 'hamstrings', desc: 'Back of the thigh. Bend the knee and extend the hip — leg curls and RDLs.' },
  { id: 'adductors', name: 'Adductors & abductors', tag: 'adductors', desc: 'Inner thigh pulls the legs together; outer hip pushes them apart. Key for squat and lunge stability.' },
  { id: 'calves', name: 'Calves', tag: 'calves', desc: 'Gastrocnemius and soleus. Point the foot — standing and seated calf raises.' },
];
export const MUSCLE_REGION = {
  pectoralis_major: 'chest', serratus_anterior: 'obliques',
  anterior_deltoid: 'frontdelts', lateral_deltoid: 'sidedelts', supraspinatus: 'sidedelts', posterior_deltoid: 'reardelts',
  biceps_brachii: 'biceps', brachialis: 'biceps', triceps_brachii: 'triceps',
  forearm_flexors: 'forearms', forearm_extensors: 'forearms', brachioradialis: 'forearms', forearms: 'forearms',
  rectus_abdominis: 'abs', transverse_abdominis: 'abs', obliques: 'obliques', hip_flexors: 'hipflexors',
  latissimus_dorsi: 'lats', trapezius: 'upperback', rhomboids: 'upperback',
  erector_spinae: 'lowerback', quadratus_lumborum: 'lowerback',
  gluteus_maximus: 'glutes', gluteus_medius: 'glutes',
  quadriceps: 'quads', hamstrings: 'hamstrings', adductors: 'adductors', abductors: 'adductors',
  gastrocnemius: 'calves', soleus: 'calves',
};
const UPPER_CHEST = /incline|low.to.high|reverse.grip/i;
const musclesOf = (x, k) => [].concat(x?.[k] ?? []).filter((m) => typeof m === 'string');
// Regions of one exercise; pec work named incline/low-to-high also counts as upper chest
export function exRegions(x, k = 'primary_muscles') {
  const out = new Set();
  for (const m of musclesOf(x, k)) {
    const r = MUSCLE_REGION[m];
    if (r) out.add(r);
    if (m === 'pectoralis_major' && UPPER_CHEST.test(x.name_en || '')) out.add('upperchest');
  }
  return [...out];
}
// 'primary' | 'secondary' | null for a region
export function regionRole(x, region) {
  if (exRegions(x).includes(region)) return 'primary';
  return exRegions(x, 'secondary_muscles').includes(region) ? 'secondary' : null;
}
// "My gym": no barbell/kettlebell/bands/suspension/rings/ropes/balls. Missing equipment = bodyweight (kept).
export const NOT_MY_GYM = new Set(['barbell', 'kettlebell', 'resistance_band', 'loop_band', 'suspension_trainer', 'rings',
  'battle_rope', 'stability_ball', 'medicine_ball', 'slam_ball']);
export const equipOf = (x) => [].concat(x?.equipment ?? []).filter(Boolean);
export const isMyGym = (x) => !equipOf(x).some((e) => NOT_MY_GYM.has(e));
// Exercises hitting a region, primary matches first, then by name
export function exercisesFor(list, region) {
  const out = [];
  for (const x of list) { const role = regionRole(x, region); if (role) out.push({ x, role }); }
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1) || a.x.name_en.localeCompare(b.x.name_en));
}
// Sets per region over sessions finished at/after sinceMs. getEx(id) → RepDB exercise; idOf(entry, session) → id
export function regionHeat(sessions, sinceMs, getEx, idOf = (e) => e.repdbId) {
  const heat = {};
  for (const s of sessions) {
    if (new Date(s.finishedAt || s.startedAt) < sinceMs) continue;
    for (const e of s.entries) for (const r of exRegions(getEx(idOf(e, s))))
      heat[r] = (heat[r] || 0) + e.sets.length;
  }
  return heat;
}
// Up to n other My-gym exercises sharing a primary region
export function alternativesFor(list, x, n = 3) {
  const rs = exRegions(x);
  return list.filter((y) => y.id !== x.id && isMyGym(y) && exRegions(y).some((r) => rs.includes(r))).slice(0, n).map((y) => y.id);
}
