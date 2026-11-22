import { CONTRACTS } from '../data/balance';
import type { Contract } from '../game/contracts';
import { formatMoney } from '../game/format';
import { t } from '../i18n';

export function contractGoal(contract: Contract): string {
  const target = contract.kind === 'earn' ? formatMoney(contract.target) : contract.target;
  return t(`contract.${contract.kind}`, { target, multiplier: CONTRACTS.winMultiplier, name: t(`ticket.${contract.ticket}.name`) });
}
