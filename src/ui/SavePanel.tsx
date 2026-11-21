import { useState } from 'react';
import { play } from '../audio/sfx';
import { deserialize, serialize } from '../game/save';
import { t, type MessageKey } from '../i18n';
import { Icon } from './Icon';
import type { Game } from './useGame';

export function SavePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  const exportSave = () => {
    const save = serialize(game.state);
    setText(save);
    setNotice('save.exported');
    void navigator.clipboard?.writeText(save).catch(() => undefined);
  };

  const importSave = () => {
    const state = deserialize(text);
    if (state) game.replace(state);
    else play('ui-error');
    setNotice(state ? 'save.imported' : 'save.invalid');
  };

  const reset = () => {
    game.reset();
    setText('');
    setNotice(null);
    setConfirming(false);
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('save.title')} onClick={onClose}>
      <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('hud.pause')}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label={t('save.close')}>
            <Icon name="cross" />
          </button>
        </div>
        <button className="btn btn-primary" onClick={onClose}>
          {t('hud.resume')}
        </button>
        <hr />
        <p role={game.saveFailed ? 'status' : undefined}>{t(game.saveFailed ? 'save.unsaved' : 'save.auto')}</p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('save.placeholder')}
          aria-label={t('save.title')}
          rows={4}
          spellCheck={false}
        />
        <div className="modal-actions">
          <button className="btn" onClick={exportSave}>
            <Icon name="export" />
            {t('save.export')}
          </button>
          <button className="btn" onClick={importSave} disabled={text.trim() === ''}>
            <Icon name="import" />
            {t('save.import')}
          </button>
        </div>
        {notice && <p role="status">{t(notice)}</p>}
        <hr />
        {confirming ? (
          <div className="modal-actions">
            <p>{t('save.resetConfirm')}</p>
            <button className="btn btn-danger" data-testid="reset-confirm" onClick={reset}>
              {t('save.resetYes')}
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              {t('save.resetNo')}
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" data-testid="reset" onClick={() => setConfirming(true)}>
            <Icon name="trashcan" />
            {t('save.reset')}
          </button>
        )}
        <p className="fineprint">{t('app.playMoney')}</p>
      </div>
    </div>
  );
}
