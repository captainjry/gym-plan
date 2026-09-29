// Run: node test_explore.mjs   (from wt-explore/). Reads the local RepDB copy one level up (never committed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from './logic.js';

const j = JSON.parse(readFileSync(new URL('../repdb-exercises.local.json', import.meta.url)));
const all = j.exercises || j;
const ids = new Set(L.REGIONS.map((r) => r.id));
for (const x of all) for (const k of ['primary_muscles', 'secondary_muscles'])
  for (const m of [].concat(x[k] ?? [])) if (typeof m === 'string') assert.ok(ids.has(L.MUSCLE_REGION[m]), `unmapped ${m}`);
for (const r of ids) assert.ok(L.exercisesFor(all, r).some((e) => e.role === 'primary'), `empty region ${r}`);

const byId = new Map(all.map((x) => [x.id, x]));
const inc = all.find((x) => /incline/i.test(x.name_en) && x.primary_muscles.includes('pectoralis_major'));
assert.ok(L.exRegions(inc).includes('upperchest') && L.exRegions(inc).includes('chest'));
assert.equal(L.isMyGym({ equipment: 'barbell' }), false);
assert.equal(L.isMyGym({}), true);
assert.equal(L.isMyGym({ equipment: 'dumbbell' }), true);
const list = L.exercisesFor(all, 'biceps');
assert.equal(list[0].role, 'primary');
assert.ok(list.findIndex((e) => e.role === 'secondary') > list.findLastIndex((e) => e.role === 'primary'));

const now = Date.now();
const sess = [
  { finishedAt: new Date(now - 864e5).toISOString(), entries: [{ repdbId: inc.id, sets: [{}, {}] }] },
  { finishedAt: new Date(now - 30 * 864e5).toISOString(), entries: [{ repdbId: list[0].x.id, sets: [{}] }, { repdbId: null, sets: [{}] }] },
];
const h = L.regionHeat(sess, now - 7 * 864e5, (id) => byId.get(id));
assert.equal(h.chest, 2); assert.equal(h.biceps, undefined);

const alts = L.alternativesFor(all, inc);
assert.ok(alts.length === 3 && !alts.includes(inc.id) && alts.every((id) => L.isMyGym(byId.get(id))));
console.log('explore tests ok');
