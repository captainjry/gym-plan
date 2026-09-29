import assert from 'node:assert/strict';
import * as L from './logic.js';
const at = (d) => `2026-09-${String(d).padStart(2, '0')}T10:00:00`;
const S = (id, d, entries) => ({ id, startedAt: at(d), entries });
const E = (name, ...sets) => ({ name, sets: sets.map(([kg, reps]) => ({ kg, reps })) });

assert.equal(L.e1rm(60, 10), 80); assert.equal(L.e1rm(-30, 8), null); assert.equal(L.e1rm(null, 8), null);
// weighted: higher e1RM wins
assert(!L.beats({ kg: 60, reps: 10 }, { kg: 70, reps: 5 }));
assert(L.beats({ kg: 62.5, reps: 10 }, { kg: 60, reps: 10 }));
// assisted: less assistance at >= reps wins; fewer reps doesn't
assert(L.beats({ kg: -25, reps: 6 }, { kg: -30, reps: 6 }));
assert(!L.beats({ kg: -25, reps: 5 }, { kg: -30, reps: 6 }));
assert(L.beats({ kg: -30, reps: 7 }, { kg: -30, reps: 6 }));
// bodyweight: more reps
assert(L.beats({ kg: null, reps: 12 }, { kg: null, reps: 10 })); assert(!L.beats({ kg: null, reps: 10 }, { kg: null, reps: 10 }));
assert(!L.beats({ kg: null, reps: 99 }, { kg: 10, reps: 1 })); // different kinds never compare
assert.deepEqual(L.bestSet([{ kg: -30, reps: 8 }, { kg: -20, reps: 5 }, { kg: -20, reps: 6 }]), { kg: -20, reps: 6 });
assert.equal(L.bestSet([{ kg: 50, reps: 5 }, { kg: 60, reps: 5 }]).kg, 60);
assert.equal(L.bestSet([]), null);

const sess = [
  S('a', 1, [E('Bench', [60, 8]), E('Pull-up', [-30, 6]), E('Dip', [null, 8])]),
  S('b', 3, [E('bench', [60, 8], [62.5, 8], [62.5, 8]), E('Pull-up', [-25, 5], [-25, 6]), E('Dip', [null, 8], [null, 9])]),
];
const pr = L.prMap(sess);
assert(!pr.has('a|0|0'), 'first time is not a PR');
assert(!pr.has('b|0|0')); assert(pr.has('b|0|1')); assert(!pr.has('b|0|2')); // same-session repeat isn't a PR
assert(!pr.has('b|1|0')); assert(pr.has('b|1|1')); // -25x5 fewer reps than -30x6: no; -25x6 yes
assert(!pr.has('b|2|0')); assert(pr.has('b|2|1'));
const h = L.exHistory(sess, 'BENCH');
assert.equal(h.length, 2); assert.equal(L.chartValue(h[1].sets), 79.17);
assert.equal(L.chartValue(L.exHistory(sess, 'pull-up')[1].sets), 25);
assert.equal(L.chartValue(L.exHistory(sess, 'dip')[1].sets), 9);
const rec = L.records(sess);
assert.equal(rec.length, 3);
const bench = rec.find((r) => r.name === 'bench'); assert.equal(bench.heaviest.kg, 62.5); assert.equal(bench.e1rm.kg, 62.5);
assert.equal(rec.find((r) => r.name === 'Pull-up').e1rm, null);

// weeks: 2026-09-30 is a Wednesday; week = Mon 28 Sep .. Sun 4 Oct
const now = new Date(2026, 8, 30, 12);
const w = L.weekInfo([S('x', 28, []), S('y', 30, []), S('z', 30, []), S('old', 20, [])], now);
assert.deepEqual(w.days, [true, false, true, false, false, false, false]); assert.equal(w.count, 3); assert.equal(w.today, 2);
assert.equal(L.weekStreak([], now), 0);
assert.equal(L.weekStreak([S('a', 30, [])], now), 1);
assert.equal(L.weekStreak([S('a', 23, []), S('b', 16, [])], now), 2); // this week empty, last 2 weeks count
assert.equal(L.weekStreak([S('a', 30, []), S('b', 16, [])], now), 1); // gap
assert.equal(L.weekStreak([S('a', 9, [])], now), 0);

// bodyweight
let bw = L.logBodyweight([], '2026-09-01', 80); bw = L.logBodyweight(bw, '2026-09-20', 79.5); bw = L.logBodyweight(bw, '2026-09-01', 81);
assert.deepEqual(bw, [{ date: '2026-09-01', kg: 81 }, { date: '2026-09-20', kg: 79.5 }]);
assert.equal(L.change30(bw), -1.5); assert.equal(L.change30([bw[0]]), null);
assert.deepEqual(L.movingAvg(bw).map((x) => x.kg), [81, 79.5]);
assert.deepEqual(L.movingAvg(L.logBodyweight(bw, '2026-09-22', 78.5)).map((x) => x.kg), [81, 79.5, 79]);
console.log('history tests ok');
