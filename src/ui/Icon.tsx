import type { CSSProperties } from 'react';
import { ASSETS } from '../render/assets';

export type IconName =
  | 'audio-on' | 'audio-off' | 'gear' | 'shopping-cart' | 'locked' | 'unlocked' | 'checkmark' | 'cross'
  | 'export' | 'import' | 'trashcan' | 'trophy' | 'target' | 'star' | 'save';

/** A one-colour icon that takes the surrounding text colour. */
export function Icon({ name }: { name: IconName }) {
  const style = { '--icon': `url("${ASSETS}/icons/${name}.png")` } as CSSProperties;
  return <span className="icon" style={style} aria-hidden="true" />;
}

export function Sticker({ name, className = 'sticker' }: { name: string; className?: string }) {
  return <img className={className} src={`${ASSETS}/stickers/${name}.png`} alt="" draggable={false} />;
}
