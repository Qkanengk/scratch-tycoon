import { describe, expect, it } from 'vitest';
import { awaySummaryText } from './awaySummary';
import { promptFor } from './Hud';
import { createInitialState } from '../game/state';

describe('away receipt text', () => {
  it('shows exact credited xu, capped duration, ticket count and limits in the prompt', () => {
    const summary = { countedMs: 3600_000, tickets: 38, credited: 24590, limits: ['battery'] as ('battery' | 'cap' | 'money')[] };
    const text = awaySummaryText(summary);
    expect(text.time).toBe('Thời gian tính: 1 giờ 0 phút 0 giây');
    expect(text.tickets).toBe('Đã cào: 38 vé');
    expect(text.credited).toBe('Thực cộng ví: +24.590 xu (đã trừ vé và thuế)');
    expect(text.limits).toBe('Giới hạn: Hết pin');
    const s = createInitialState(1);
    s.automation.awaySummary = summary;
    expect(promptFor(s, 0, 'robots', 0).message).toBe(text.prompt);
    expect(promptFor(s, 0, 'shop', 0).button?.command).toBe('awayReceipt');
  });
  it('explains time and money limits without abbreviating the credit', () => {
    expect(awaySummaryText({ countedMs: 7200_000, tickets: 1, credited: 5, limits: ['cap', 'money'] }).limits)
      .toBe('Giới hạn: Chạm trần thời gian · Hết tiền mua vé');
    expect(awaySummaryText({ countedMs: 1000, tickets: 1, credited: 1, limits: [] }).limits).toBe('Giới hạn: Đủ thời gian vắng');
  });
});
