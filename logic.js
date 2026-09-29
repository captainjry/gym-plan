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

// Prefill for the next set of this exercise
export function prefill(ex, lastSets, curSets) {
  const i = curSets.length;
  const up = progression(ex, lastSets);
  const prev = curSets[i - 1];
  const last = lastSets[i] || lastSets[lastSets.length - 1];
  const kg = prev ? prev.kg : up ?? last?.kg ?? ex.startKg ?? null;
  const reps = up != null ? ex.repMin : last?.reps ?? prev?.reps ?? ex.repMin;
  return { kg, reps };
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
