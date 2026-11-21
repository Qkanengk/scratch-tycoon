import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('HUD glyphs', () => {
  it.each(['audio-on', 'audio-off', 'pause'] as const)('draws %s without an external image mask', (name) => {
    const markup = renderToStaticMarkup(<Icon name={name} />);
    expect(markup).toContain('<svg');
    expect(markup).toContain('<path');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('--icon');
  });

  it('distinguishes the muted and audible glyphs', () => {
    expect(renderToStaticMarkup(<Icon name="audio-on" />)).not.toBe(renderToStaticMarkup(<Icon name="audio-off" />));
  });

  it('keeps other asset icons unchanged', () => {
    expect(renderToStaticMarkup(<Icon name="export" />)).toContain('/icons/export.png');
  });
});
