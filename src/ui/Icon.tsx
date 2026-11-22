import type { CSSProperties } from 'react';
import { ASSETS } from '../render/assets';

export type IconName =
  | 'audio-on' | 'audio-off' | 'pause' | 'gear' | 'shopping-cart' | 'locked' | 'unlocked' | 'checkmark' | 'cross'
  | 'export' | 'import' | 'trashcan' | 'trophy' | 'target' | 'star' | 'save'
  | 'arrow-up' | 'arrow-down' | 'arrow-left' | 'arrow-right';

/** A one-colour icon that takes the surrounding text colour. */
export function Icon({ name }: { name: IconName }) {
  const maskImage = `url("${ASSETS}/icons/${name}.png")`;
  const style: CSSProperties = { maskImage, WebkitMaskImage: maskImage };
  const hud = name === 'audio-on' || name === 'audio-off' || name === 'pause';
  return <span className={hud ? 'icon hud-glyph' : 'icon'} style={style} aria-hidden="true" />;
}

export function Sticker({ name, className = 'sticker' }: { name: string; className?: string }) {
  return <img className={className} src={`${ASSETS}/stickers/${name}.png`} alt="" draggable={false} />;
}
