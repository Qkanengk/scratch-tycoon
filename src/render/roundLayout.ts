export interface RoundTile {
  x: number;
  z: number;
  scale: number;
}

export interface RoundLayout {
  tiles: RoundTile[];
  width: number;
  height: number;
  badgeZ: number;
  returnZ?: number;
  scale: number;
}

export function roundLayout(count: number, ticketHeight: number, aspect: number, desktop: boolean, returnable = false): RoundLayout {
  if (count <= 1) return { tiles: count ? [{ x: 0, z: 0, scale: 1 }] : [], width: 1, height: ticketHeight, badgeZ: 0, scale: 1 };
  const gap = .09;
  const badgeSpace = returnable ? .46 : .26;
  let columns = 1;
  let best = 0;
  for (let candidate = 1; candidate <= Math.min(count, desktop ? count : 3); candidate++) {
    const rows = Math.ceil(count / candidate);
    const width = candidate + (candidate - 1) * gap;
    const height = rows * ticketHeight + (rows - 1) * gap + badgeSpace;
    const fit = Math.min(aspect / (width + .26), 1 / (height + .26));
    if (fit > best) { best = fit; columns = candidate; }
  }
  const rows = Math.ceil(count / columns);
  const width = columns + (columns - 1) * gap;
  const height = rows * ticketHeight + (rows - 1) * gap + badgeSpace;
  const scale = Math.min(1, 2.8 / (width + .26), 2.2 / (height + .26));
  const tiles = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const inRow = Math.min(columns, count - row * columns);
    return { x: (index % columns - (inRow - 1) / 2) * (1 + gap) * scale,
      z: (-height / 2 + ticketHeight / 2 + row * (ticketHeight + gap)) * scale, scale };
  });
  return { tiles, width: width * scale, height: height * scale, badgeZ: (height / 2 - badgeSpace + .13) * scale,
    returnZ: returnable ? (height / 2 - .1) * scale : undefined, scale };
}

export function roundTileAt(layout: RoundLayout, height: number, x: number, z: number): number {
  return layout.tiles.findIndex(tile => Math.abs(x - tile.x) <= tile.scale / 2 && Math.abs(z - tile.z) <= height * tile.scale / 2);
}
