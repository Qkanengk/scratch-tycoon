import { ACHIEVEMENTS, ACHIEVEMENT_BONUS_PERCENT, ALL_STAMPS, COLLECTION_BONUS_PERCENT, COLLECTION_STAMPS } from '../data/journal';
import { BIG_WIN_MULTIPLIER, TICKET_IDS, ticketDef, type TicketId } from '../data/tickets';
import type { Ticket } from './state';
import { jackpotTier } from './tickets';

export type AchievementKind = keyof typeof ACHIEVEMENTS;
export const ACHIEVEMENT_KINDS = Object.keys(ACHIEVEMENTS) as AchievementKind[];
export const ACHIEVEMENT_TOTAL = ACHIEVEMENT_KINDS.reduce((total, kind) => total + ACHIEVEMENTS[kind].length, 0);

export interface Journal {
  scratched: number;
  wins: number;
  bigWins: number;
  jackpots: number;
  currentStreak: number;
  streak: number;
  stamps: Record<TicketId, number>;
}

export const initialJournal = (): Journal => ({
  scratched: 0, wins: 0, bigWins: 0, jackpots: 0, currentStreak: 0, streak: 0,
  stamps: { dong: 0, bac: 0, vang: 0, ngoc: 0, rong: 0, vutru: 0 },
});

export const completedSets = (journal: Journal) => TICKET_IDS.filter(id => journal.stamps[id] === ALL_STAMPS).length;

export function achievementProgress(journal: Journal, prestigeTier: number, kind: AchievementKind): number {
  if (kind === 'sets') return completedSets(journal);
  if (kind === 'prestige') return prestigeTier;
  return journal[kind];
}

export function achievementCount(journal: Journal, prestigeTier: number): number {
  let count = 0;
  for (const kind of ACHIEVEMENT_KINDS) {
    const progress = achievementProgress(journal, prestigeTier, kind);
    for (const target of ACHIEVEMENTS[kind]) {
      if (progress < target) break;
      count++;
    }
  }
  return count;
}

export function journalBonusPercent(journal: Journal, prestigeTier: number, id: TicketId): number {
  return achievementCount(journal, prestigeTier) * ACHIEVEMENT_BONUS_PERCENT
    + (journal.stamps[id] === ALL_STAMPS ? COLLECTION_BONUS_PERCENT : 0);
}

export function recordTicketInJournal(journal: Journal, ticket: Ticket): Journal {
  const def = ticketDef(ticket.type);
  const win = !ticket.fakeTell && ticket.gross > 0;
  const currentStreak = win ? journal.currentStreak + 1 : 0;
  const stamp = win ? COLLECTION_STAMPS.find(stamp => stamp.tier === ticket.tier) : undefined;
  const mask = journal.stamps[ticket.type] | (stamp?.bit ?? 0);
  return {
    scratched: journal.scratched + 1,
    wins: journal.wins + Number(win),
    bigWins: journal.bigWins + Number(win && ticket.gross >= def.price * BIG_WIN_MULTIPLIER),
    jackpots: journal.jackpots + Number(win && ticket.tier === jackpotTier(def)),
    currentStreak,
    streak: Math.max(currentStreak, journal.streak),
    stamps: mask === journal.stamps[ticket.type] ? journal.stamps : { ...journal.stamps, [ticket.type]: mask },
  };
}
