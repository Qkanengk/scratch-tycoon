import { formatMoney } from '../game/format';

/** Play-money amount with its unit. */
export function money(value: number): string {
  return `${formatMoney(value)} xu`;
}
