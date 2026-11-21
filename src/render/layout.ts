import type { TicketRules } from '../data/tickets';
import type { Rect } from '../game/scratch';

export type LabelKey = 'winning' | 'yours' | 'multiplier';

export interface TicketLayout {
  /** Height of the scratch area in units of its width. */
  height: number;
  /** One rectangle per cell, in the order of the ticket's cells. */
  cells: Rect[];
  labels: { key: LabelKey; y: number; h: number }[];
}

interface Row {
  label?: LabelKey;
  count: number;
  cols: number;
  /** Cell height; defaults to the cell width. */
  cellHeight?: number;
}

const PAD = 0.04;
const GAP = 0.025;
const LABEL_HEIGHT = 0.07;

function rowsFor(rules: TicketRules): Row[] {
  switch (rules.kind) {
    case 'match':
      return [{ count: rules.cells, cols: 3 }];
    case 'lucky': {
      const rows: Row[] = [
        { label: 'winning', count: rules.winning, cols: rules.winning, cellHeight: 0.16 },
        { label: 'yours', count: rules.numbers, cols: rules.numbers % 3 === 0 ? 3 : 4, cellHeight: 0.19 },
      ];
      if (rules.multipliers) rows.push({ label: 'multiplier', count: 1, cols: 1, cellHeight: 0.14 });
      return rows;
    }
    case 'dragon':
      return [{ count: rules.size * rules.size, cols: rules.size }];
  }
}

export function layoutTicket(rules: TicketRules): TicketLayout {
  const cells: Rect[] = [];
  const labels: TicketLayout['labels'] = [];
  let y = PAD;
  for (const row of rowsFor(rules)) {
    if (row.label) {
      labels.push({ key: row.label, y, h: LABEL_HEIGHT });
      y += LABEL_HEIGHT;
    }
    const w = (1 - 2 * PAD - (row.cols - 1) * GAP) / row.cols;
    const h = row.cellHeight ?? w;
    for (let i = 0; i < row.count; i++) {
      const col = i % row.cols;
      const line = Math.floor(i / row.cols);
      cells.push({ x: PAD + col * (w + GAP), y: y + line * (h + GAP), w, h });
    }
    const lines = Math.ceil(row.count / row.cols);
    y += lines * h + (lines - 1) * GAP + GAP;
  }
  return { height: y - GAP + PAD, cells, labels };
}
