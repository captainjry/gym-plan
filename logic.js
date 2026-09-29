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
