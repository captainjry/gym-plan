import assert from 'node:assert/strict';
import * as L from './logic.js';
const ex = { id: 'a1', name: 'Press', sets: 2, repMin: 8, repMax: 10, stepKg: 2.5, startKg: 20 };
const hit = [{ kg: 30, reps: 10 }, { kg: 30, reps: 10 }]; // triggers ↑ 32.5
assert.equal(L.prefill(ex, hit, []).kg, 32.5);
assert.equal(L.prefill({ ...ex, nextKg: 35 }, hit, []).kg, 35);      // override beats hint + last
assert.equal(L.prefill({ ...ex, nextKg: 25 }, [], []).kg, 25);       // beats startKg
assert.equal(L.prefill({ ...ex, nextKg: 35 }, hit, [{ kg: 34, reps: 8 }]).kg, 34); // later sets follow previous
assert.equal(L.prefill({ ...ex, nextKg: null }, hit, []).kg, 32.5);
assert.equal(L.prefill({ ...ex, nextKg: -35, startKg: -40 }, [], []).kg, -35);
assert.equal(L.defaultNextKg({ ...ex, nextKg: 99 }, hit), 32.5);     // ignores existing override
assert.equal(L.defaultNextKg(ex, []), 20);
const oldP = { days: [{ exercises: [{ id: 'a1', nextKg: 35 }, { id: 'a2' }] }] };
const np = L.carryNextKg(oldP, { days: [{ exercises: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] }] });
assert.deepEqual(np.days[0].exercises.map((x) => x.nextKg), [35, undefined, undefined]);
assert.doesNotThrow(() => L.carryNextKg(undefined, np));
console.log('nextkg ok');
