import { automationPrice, type AutomationAction } from '../game/automation';
import { formatCompact } from '../game/format';
import type { GameState } from '../game/state';
import { t } from '../i18n';

export function robotOfferLabel(state: GameState, action: AutomationAction): string {
  if (!state.automation.robots.length && action !== 'robot') return t('robot.needRobot');
  if (action === 'away' && !state.automation.autoBuy) return t('robot.needAutoBuy');
  if (action === 'cap' && !state.automation.away) return t('robot.needAway');
  const price = automationPrice(state, action);
  return Number.isFinite(price) ? t('robot.price', { cost: formatCompact(price) }) : t('robot.max');
}
