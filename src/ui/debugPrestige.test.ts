import { describe, expect, it } from 'vitest';
import { canPrestige } from '../game/prestige';
import { deserialize, serialize } from '../game/save';
import { prestigeScenario } from './debugPrestige';

describe('isolated prestige fixtures', () => {
  it('provides a genuinely eligible run and a fresh ineligible run', () => {
    expect(canPrestige(prestigeScenario('eligible'))).toBe(true);
    expect(canPrestige(prestigeScenario('start'))).toBe(false);
  });
  it.each(['eligible', 'start', 'board', 'ticket', 'complete'])('round-trips the %s fixture through save validation', scene => {
    const state = prestigeScenario(scene);
    const saved = deserialize(serialize(state))!;
    expect(saved).not.toBeNull();
    expect(saved.prestige).toEqual(state.prestige);
    expect(saved.ticket?.type).toBe(state.ticket?.type);
  });
  it('makes the board wait and the sixth ticket selectable only after prestige', () => {
    expect(prestigeScenario('board').prestige.tier).toBe(1);
    expect(prestigeScenario('board').licenseElapsedMs).toBeLessThan(20 * 60_000);
    expect(prestigeScenario('ticket').ticket?.type).toBe('vutru');
    expect(prestigeScenario('complete').prestige.tier).toBe(5);
  });
});
