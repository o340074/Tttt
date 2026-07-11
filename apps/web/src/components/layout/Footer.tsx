import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-6 md:px-6">
        <p className="text-sm text-text-dim">
          © {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}
        </p>
        <p className="text-xs uppercase tracking-[0.08em] text-text-dim">{t('brand.tagline')}</p>
      </div>
    </footer>
  );
}
