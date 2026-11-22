import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS_PERCENT, ALL_STAMPS, COLLECTION_BONUS_PERCENT, COLLECTION_STAMPS } from '../data/journal';
import { BIG_WIN_MULTIPLIER, TICKETS } from '../data/tickets';
import { formatMoney } from '../game/format';
import { ACHIEVEMENT_KINDS, ACHIEVEMENT_TOTAL, achievementCount, achievementProgress, completedSets } from '../game/journal';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { ASSETS, patternPath } from '../render/assets';
import { Icon, Sticker } from './Icon';

const stampIcons = { rare: 'star', big: 'gold-ingots', jackpot: 'crown' } as const;

export function Journal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [page, setPage] = useState<'achievements' | 'collection'>('achievements');
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const earned = achievementCount(state.journal, state.prestige.tier);

  useEffect(() => {
    const book = dialog.current!;
    book.showModal();
    return () => book.close();
  }, []);

  const changePage = (next: typeof page) => {
    setPage(next);
    scroll.current?.scrollTo(0, 0);
  };

  return (
    <dialog className="journal card" ref={dialog} aria-labelledby="journal-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="journal-book">
        <header className="modal-head">
          <h2 id="journal-title"><Icon name="trophy" /> {t('journal.title')}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label={t('save.close')}><Icon name="cross" /></button>
        </header>
        <nav className="journal-tabs" aria-label={t('journal.title')}>
          {(['achievements', 'collection'] as const).map(tab => (
            <button key={tab} className="btn" aria-pressed={page === tab} onClick={() => changePage(tab)}>
              {t(`journal.${tab}`)}
            </button>
          ))}
        </nav>
        <div className="journal-page" ref={scroll} tabIndex={0} aria-label={t(`journal.${page}`)}>
          {page === 'achievements' ? <>
            <h3>{t('journal.achievementSummary', { count: earned, total: ACHIEVEMENT_TOTAL, bonus: earned * ACHIEVEMENT_BONUS_PERCENT })}</h3>
            <p>{t('journal.achievementRule', { bonus: ACHIEVEMENT_BONUS_PERCENT })}</p>
            <ul className="achievement-list">
              {ACHIEVEMENT_KINDS.flatMap(kind => {
                const value = achievementProgress(state.journal, state.prestige.tier, kind);
                return ACHIEVEMENTS[kind].map(target => (
                  <li key={`${kind}-${target}`} data-earned={value >= target}>
                    <span>{t(`journal.achievement.${kind}`, { target: formatMoney(target), multiplier: BIG_WIN_MULTIPLIER })}</span>
                    <b>{value >= target ? t('journal.done') : `${formatMoney(value)}/${formatMoney(target)}`}</b>
                  </li>
                ));
              })}
            </ul>
          </> : <>
            <h3>{t('journal.collectionSummary', { count: completedSets(state.journal), total: TICKETS.length })}</h3>
            <p>{t('journal.collectionRule', { bonus: COLLECTION_BONUS_PERCENT })}</p>
            <div className="collection-list">
              {TICKETS.map(def => (
                <section className="collection-set" key={def.id}>
                  <h4 style={{ backgroundImage: `linear-gradient(#fff3d6dd, #fff3d6ee), url("${ASSETS}/${patternPath(`paper-${def.id}`)}")` }}>
                    {t(`ticket.${def.id}.name`)}
                    {state.journal.stamps[def.id] === ALL_STAMPS && <small>{t('journal.collectionBonus', { bonus: COLLECTION_BONUS_PERCENT })}</small>}
                  </h4>
                  <ul className="collection-stamps">
                    {COLLECTION_STAMPS.map(stamp => {
                      const owned = (state.journal.stamps[def.id] & stamp.bit) !== 0;
                      return <li key={stamp.id} data-owned={owned}>
                        <Sticker name={stampIcons[stamp.id]} />
                        <strong>×{def.prizes[stamp.tier]?.multiplier} · {t(`journal.stamp.${stamp.id}`)}</strong>
                        <span>{t(owned ? 'journal.stamp.owned' : 'journal.stamp.missing')}</span>
                      </li>;
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>}
        </div>
      </div>
    </dialog>
  );
}
