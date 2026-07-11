import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-4 px-4 py-24 md:px-6">
      <p className="font-mono text-sm text-text-dim">404</p>
      <h1 className="text-3xl font-bold">{t('notFound.title')}</h1>
      <p className="text-text-lo">{t('notFound.description')}</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-volt px-4 py-2 text-sm font-semibold text-white shadow-glow-volt transition-colors duration-[140ms] hover:bg-volt-600"
      >
        {t('notFound.backHome')}
        <Icon name="arrow-right" className="text-[14px]" />
      </Link>
    </div>
  );
}
