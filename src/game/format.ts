function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function withUnit(n: number, size: number, suffix: string): string {
  // Round down to one decimal so an amount is never overstated.
  const tenths = Math.floor(n / (size / 10));
  const fraction = tenths % 10;
  return `${groupThousands(Math.floor(tenths / 10))}${fraction ? `,${fraction}` : ''} ${suffix}`;
}

/** Vietnamese money: full digits below a million (12.345), then 1,2 Tr and 5,6 Tỷ. */
export function formatMoney(value: number): string {
  const n = Math.floor(value);
  if (n >= 1e9) return withUnit(n, 1e9, 'Tỷ');
  if (n >= 1e6) return withUnit(n, 1e6, 'Tr');
  return groupThousands(n);
}

/** Shorter form for small cells: 12K, 1,5 Tr. */
export function formatCompact(value: number): string {
  const n = Math.floor(value);
  if (n >= 1e6) return formatMoney(n);
  if (n >= 1e3) return withUnit(n, 1e3, 'K').replace(' K', 'K');
  return String(n);
}
