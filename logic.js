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
