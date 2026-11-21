import { t } from '../i18n';

export function App() {
  return (
    <main className="splash">
      <h1>{t('app.title')}</h1>
      <p className="tagline">{t('app.tagline')}</p>
      <p>{t('app.comingSoon')}</p>
      <p className="fineprint">{t('app.playMoney')}</p>
    </main>
  );
}
