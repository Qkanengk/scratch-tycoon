import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../game/state';
import { t } from '../i18n';
import { SavePanel } from './SavePanel';

describe('SavePanel autosave status', () => {
  it.each([false, true])('shows the current save failure status (%s)', (saveFailed) => {
    const game = {
      state: createInitialState(1), recovered: false, saveFailed, now: 0,
      apply: vi.fn(), reset: vi.fn(), replace: vi.fn(),
    };
    const markup = renderToStaticMarkup(createElement(SavePanel, { game, onClose: vi.fn() }));
    expect(markup).toContain(t(saveFailed ? 'save.unsaved' : 'save.auto'));
    expect(markup).not.toContain(t(saveFailed ? 'save.auto' : 'save.unsaved'));
  });
});
