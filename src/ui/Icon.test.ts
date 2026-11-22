import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ASSETS } from '../render/assets';
import { Icon } from './Icon';

describe('HUD glyphs', () => {
  it('distinguishes the muted and audible glyphs', () => {
    expect(renderToStaticMarkup(createElement(Icon, { name: 'audio-on' }))).not.toBe(renderToStaticMarkup(createElement(Icon, { name: 'audio-off' })));
  });

  it.each(['audio-on', 'audio-off', 'pause', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'gear', 'shopping-cart', 'locked', 'unlocked', 'checkmark', 'cross', 'export', 'import', 'trashcan', 'trophy', 'target', 'star', 'save'] as const)('sets %s mask URLs directly on the element', (name) => {
    const markup = renderToStaticMarkup(createElement(Icon, { name }));
    expect(markup).toContain(`mask-image:url(&quot;${ASSETS}/icons/${name}.png&quot;)`);
    expect(markup).toContain(`-webkit-mask-image:url(&quot;${ASSETS}/icons/${name}.png&quot;)`);
    expect(markup).not.toContain('--icon');
    expect(markup).toContain('aria-hidden="true"');
  });
});
