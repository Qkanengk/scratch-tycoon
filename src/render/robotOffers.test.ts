import { describe, expect, it } from 'vitest';
import { automationAction } from '../game/automation';
import { createInitialState } from '../game/state';
import { robotOfferLabel } from './robotOffers';

describe('robot price tags', () => {
  const fresh = () => createInitialState(1);
  const hired = () => automationAction({ ...fresh(), money: 1e8 }, 'robot');
  it('prints a price for an available purchase even when unaffordable', () => {
    expect(robotOfferLabel({ ...fresh(), money: 0 }, 'robot')).toBe('400 xu');
    expect(robotOfferLabel(hired(), 'speed')).toBe('12K xu');
  });
  it('explains missing prerequisites instead of combining locked and maxed states', () => {
    expect(robotOfferLabel(fresh(), 'speed')).toBe('Cần thuê thợ cào');
    expect(robotOfferLabel(hired(), 'away')).toBe('Cần Mạch tự mua vé');
    expect(robotOfferLabel(hired(), 'cap')).toBe('Cần Làm khi vắng chủ');
  });
  it('prints maxed for owned circuits and capped improvements', () => {
    const auto = automationAction(hired(), 'autoBuy');
    expect(robotOfferLabel(auto, 'autoBuy')).toBe('Tối đa');
    const s = { ...auto, automation: { ...auto.automation, speed: 8, capacity: 8, away: true, capLevel: 5 } };
    for (const action of ['speed', 'capacity', 'away', 'cap'] as const) expect(robotOfferLabel(s, action)).toBe('Tối đa');
    expect(robotOfferLabel(automationAction(automationAction(hired(), 'robot'), 'robot'), 'robot')).toBe('Tối đa');
  });
});
