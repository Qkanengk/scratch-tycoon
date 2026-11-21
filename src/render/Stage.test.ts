import { describe, expect, it, vi } from 'vitest';
import type { ToolIntent } from '../game/tools';
import { Stage } from './Stage';

describe('stage shelf interactions', () => {
  it.each([null, ...(['buy', 'equip', 'upgrade'] as const).map(kind => ({ id: 'coin' as const, kind, level: 0 }))])('never navigates when pressing a shelf tool with intent %j', intent => {
    const stage = Object.create(Stage.prototype) as {
      view: string;
      callbacks: { onTool: ReturnType<typeof vi.fn>; onBoard: ReturnType<typeof vi.fn> };
      look: ReturnType<typeof vi.fn>;
      press(action: { kind: 'tool'; intent: ToolIntent | null }): void;
    };
    stage.view = 'tools';
    stage.callbacks = { onTool: vi.fn(), onBoard: vi.fn() };
    stage.look = vi.fn();
    stage.press({ kind: 'tool', intent });
    expect(stage.look).not.toHaveBeenCalled();
    expect(stage.callbacks.onBoard).not.toHaveBeenCalled();
    expect(stage.view).toBe('tools');
    if (intent) expect(stage.callbacks.onTool).toHaveBeenCalledExactlyOnceWith(intent);
    else expect(stage.callbacks.onTool).not.toHaveBeenCalled();
  });
});
