import assert from 'node:assert/strict';
import * as L from './logic.js';
// week dots: Wed 2026-09-30; Mon 28 & Wed 30 done, Sun 27 (prev week) not counted
const s = (d) => ({ finishedAt: new Date(d).toISOString() });
const w = L.weekDots([s('2026-09-27T12:00:00'), s('2026-09-28T09:00:00'), s('2026-09-30T18:00:00'), s('2026-09-30T19:00:00')], new Date('2026-09-30T20:00:00'));
assert.deepEqual(w.days, [true, false, true, false, false, false, false]);
assert.equal(w.count, 3); assert.equal(w.today, 2);
assert.equal(L.weekDots([], new Date('2026-10-04T10:00:00')).today, 6); // Sunday
assert.equal(L.shortName('Incline Dumbbell Press'), 'Incline Dumbbell');
// swap + superset follows the slot
const exs = [{ id: 'a', supersetWith: 'b' }, { id: 'b', supersetWith: 'a' }, { id: 'c' }];
const mk = (id, sets = 0) => ({ slotId: id, name: id, sets: Array(sets).fill({ kg: 1, reps: 5 }), done: false, skipped: false });
const en = [mk('a', 1), mk('b', 0), mk('c')];
assert.equal(L.splitEntry(en, 0, 'x', 'A2', true), 1);
assert.equal(en.length, 4); assert.ok(en[0].done); assert.equal(en[1].slotId, 'a'); assert.equal(en[1].name, 'A2');
const al = L.alignedExs(exs, en);
assert.equal(al.length, 4);
assert.equal(L.partnerIndex(al, 1), 2); // A2 <-> B
assert.equal(L.partnerIndex(al, 2), 1); // B  <-> A2 (not the closed old A)
assert.equal(L.partnerIndex(al, 0), -1);
// B logs a set → partner A2 (0 sets < 1) is next, no rest
en[2].sets.push({ kg: 1, reps: 5 });
assert.deepEqual(L.afterSet(al, en, 2), { next: 1, rest: false });
// swap B after its set too: B' follows; A2 then pairs with B'
L.splitEntry(en, 2, 'y', 'B2', true);
const al2 = L.alignedExs(exs, en);
assert.equal(L.partnerIndex(al2, 1), 3);
assert.equal(L.partnerIndex(al2, 3), 1);
console.log('core ok');
