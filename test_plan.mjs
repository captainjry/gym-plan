import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from './logic.js';

assert.equal(L.slug('My Plan #2!', ['my-plan-2']), 'my-plan-2-2');
assert.equal(L.slug('???'), 'plan');
const a = [1, 2, 3];
assert.ok(L.moveItem(a, 0, 1)); assert.deepEqual(a, [2, 1, 3]);
assert.ok(!L.moveItem(a, 0, -1)); assert.ok(!L.moveItem(a, 2, 1));

const j = { name: 'x {y}', days: [] };
assert.deepEqual(L.extractJson('Sure!\n```json\n' + JSON.stringify(j) + '\n```\nEnjoy {not json'), j);
assert.equal(L.extractJson('no json here'), null);
assert.deepEqual(L.extractJson('{bad} then {"a":1}'), { a: 1 });

const ul = JSON.parse(readFileSync('plans/upperlower.json', 'utf8'));
const ids = new Set(JSON.parse(readFileSync('../repdb-exercises.local.json', 'utf8')).exercises.map((e) => e.id));
let r = L.validatePlan(ul, ids);
assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []);
r = L.validatePlan(ul, null); assert.deepEqual(r.errors, []);

const bad = JSON.parse(JSON.stringify(ul));
bad.days[0].exercises[0].repdbImageId = 'nope-id';
bad.days[0].exercises[1].alternatives.push('nope-alt');
bad.days[1].exercises[0].id = bad.days[0].exercises[0].id; // dup
bad.days[0].exercises[2].repMin = 20;
bad.days[0].exercises[3].supersetWith = 'zzz';
bad.days[0].exercises[4].sets = 0;
r = L.validatePlan(bad, ids);
assert.equal(r.errors.length, 3, r.errors.join('|'));
assert.ok(r.warnings.some((w) => w.includes('nope-id')) && r.warnings.some((w) => w.includes('nope-alt')) && r.warnings.some((w) => w.includes('duplicate')));
assert.equal(r.plan.days[0].exercises[0].repdbImageId, null);
assert.equal(r.plan.days[1].exercises[0].id, bad.days[0].exercises[0].id + '-2');
assert.equal(L.validatePlan(null).errors.length, 1);
assert.equal(L.validatePlan({ name: 'a', days: [] }).errors.length, 1);
const noRot = JSON.parse(JSON.stringify(ul)); delete noRot.rotation;
assert.deepEqual(L.validatePlan(noRot).plan.rotation, ul.days.map((d) => d.id));

const dbA = [
  { id: 'a', primary_muscles: ['pectoralis_major'], equipment: 'cable' },
  { id: 'b', primary_muscles: ['pectoralis_major'], equipment: 'barbell' },
  { id: 'c', primary_muscles: ['pectoralis_major', 'anterior_deltoid'], equipment: 'cable' },
  { id: 'd', primary_muscles: ['pectoralis_major'], equipment: 'dumbbell' },
  { id: 'e', primary_muscles: ['triceps_brachii'], equipment: 'cable' },
  { id: 'f', primary_muscles: ['pectoralis_major'], equipment: 'machine' },
];
const alts = L.pickAlternatives(dbA, dbA[0], (e) => e.equipment !== 'barbell', 3);
assert.equal(alts.length, 3); assert.ok(!alts.includes('a') && !alts.includes('b') && !alts.includes('e'));
assert.equal(alts[0], 'c');
assert.equal(L.uniqueId('ua-1', ['ua-1', 'ua-1-2']), 'ua-1-3');
console.log('test_plan OK');
