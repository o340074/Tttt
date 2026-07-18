import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminStock } from '../../features/admin/api';

/** Read view of the READY_STOCK pool (docs/13): per-variant counts by status. */
export function AdminStockPage() {
  const { t } = useTranslation();
  const stock = useAdminStock();

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.stock.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.stock.subtitle')}</p>

      {stock.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : stock.isError ? (
        <>
          <Banner tone="error">{t('admin.stock.error')}</Banner>
          <Button variant="secondary" onClick={() => void stock.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : stock.data!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="briefcase" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.stock.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-semibold">{t('admin.stock.colVariant')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.stock.colAvailable')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.stock.colReserved')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.stock.colSold')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.stock.colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.data!.map((row) => (
                <tr key={row.variantId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-hi">{row.name}</div>
                    <div className="text-xs text-text-dim">{row.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-semibold tabular-nums ${row.available === 0 ? 'text-danger' : 'text-success'}`}
                    >
                      {row.available}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">{row.reserved}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">{row.sold}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-text-hi">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
