import { CYCLE_SECONDS, PACING_SEEDS, percentile, simulatePacing } from './pacing';
import { TICKETS } from '../src/data/tickets';
import { prestigeThreshold } from '../src/data/prestige';

const seeds = Number(process.env.PACING_SEEDS ?? PACING_SEEDS);
const runs = Array.from({ length: seeds }, (_, i) => simulatePacing(10_001 + i, 12 * 3600, CYCLE_SECONDS, true));
console.log(`${seeds} seeds · 12 h horizon · minutes · licence intervals since previous licence (Bạc: since run start)`);
console.log(`Prestige thresholds: ${Array.from({ length: 5 }, (_, i) => prestigeThreshold(i + 1)).join(', ')} xu`);
console.log('Milestone\tmedian\tp10\tp90');
function row(label: string, times: number[]) {
  console.log([label, ...[.5, .1, .9].map(p => (percentile(times, p) / 60).toFixed(2))].join('\t'));
}
row('firstPrestige (cumulative)', runs.map(r => r.prestige));
for (let run = 0; run < 2; run++) {
  for (const def of TICKETS.slice(1).filter(def => (def.minimumPrestige ?? 0) <= run)) {
    row(`run${run + 1}.${def.id}`, runs.map(r => r.runs[run]?.intervals[def.id] ?? Infinity));
  }
  for (const id of ['firstRobot', 'autoBuy', 'away', 'luck1', 'luck10', 'desk1', 'desk3', 'bulk1'] as const) {
    row(`run${run + 1}.${id}`, runs.map(r => r.runs[run]?.[id] ?? Infinity));
  }
}
