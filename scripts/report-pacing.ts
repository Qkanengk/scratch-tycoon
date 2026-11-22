import { percentile, simulatePacing } from './pacing';
import { TICKETS } from '../src/data/tickets';

const runs = Array.from({ length: 384 }, (_, i) => simulatePacing(10_001 + i, 6 * 3600, 4, true));
console.log('384 seeds · minutes · licence times are intervals since the previous licence');
console.log('Milestone\tmedian\tp10\tp90');
for (const id of TICKETS.slice(1).map(t => t.id)) {
  const times = runs.map(r => r.intervals[id] ?? Infinity);
  console.log([id, ...[.5, .1, .9].map(p => (percentile(times, p) / 60).toFixed(2))].join('\t'));
}
for (const id of ['firstRobot', 'autoBuy', 'away'] as const) {
  console.log([id, ...[.5, .1, .9].map(p => (percentile(runs.map(r => r[id]), p) / 60).toFixed(2))].join('\t'));
}
