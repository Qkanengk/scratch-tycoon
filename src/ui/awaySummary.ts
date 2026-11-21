import type { AwaySummary } from '../game/automation';
import { t } from '../i18n';

export function awaySummaryText(summary: AwaySummary) {
  const seconds = Math.floor(summary.countedMs / 1000);
  const time = t('robot.awayTime', { hours: Math.floor(seconds / 3600), minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 });
  const tickets = t('robot.awayTickets', { tickets: summary.tickets });
  const credited = t('robot.awayCredit', { cost: summary.credited.toLocaleString('vi-VN') });
  const limits = t('robot.awayLimits', { limits: summary.limits.length ? summary.limits.map(limit => t(`robot.limit.${limit}`)).join(' · ') : t('robot.limit.time') });
  return { time, tickets, credited, limits, prompt: `${t('robot.awayTitle')}: ${time}. ${tickets}. ${credited}. ${limits}.` };
}
