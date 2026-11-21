import type { CSSProperties } from 'react';
import { ASSETS } from '../render/assets';

export type IconName =
  | 'audio-on' | 'audio-off' | 'pause' | 'gear' | 'shopping-cart' | 'locked' | 'unlocked' | 'checkmark' | 'cross'
  | 'export' | 'import' | 'trashcan' | 'trophy' | 'target' | 'star' | 'save';

/** A one-colour icon that takes the surrounding text colour. */
export function Icon({ name }: { name: IconName }) {
  if (name === 'audio-on' || name === 'audio-off' || name === 'pause') {
    return <svg className="hud-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {name === 'pause' ? <path d="M8 5v14M16 5v14" strokeWidth="4" /> : <>
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {name === 'audio-on' ? <path d="M17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14" /> : <path d="m17 9 5 6m0-6-5 6" />}
      </>}
    </svg>;
  }
  const maskImage = `url("${ASSETS}/icons/${name}.png")`;
  const style: CSSProperties = { maskImage, WebkitMaskImage: maskImage };
  return <span className="icon" style={style} aria-hidden="true" />;
}

export function Sticker({ name, className = 'sticker' }: { name: string; className?: string }) {
  return <img className={className} src={`${ASSETS}/stickers/${name}.png`} alt="" draggable={false} />;
}
