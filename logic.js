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
