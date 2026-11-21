import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopLayout } from './room';

describe('desktop scene layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([[1280, 720, true], [1280, 960, true], [1024, 768, true], [390, 844, false], [844, 390, false], [740, 360, false], [800, 1200, false]])('gates %s × %s', (width, height, expected) => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: height <= 500 }) });
    expect(desktopLayout(width, height)).toBe(expected);
  });

  it('keeps large windows on desktop layout even with touch available', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(desktopLayout(1280, 960)).toBe(true);
    expect(desktopLayout(1024, 768)).toBe(true);
  });

  it('keeps smaller touch screens on phone layout', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(desktopLayout(844, 600)).toBe(false);
  });
});
