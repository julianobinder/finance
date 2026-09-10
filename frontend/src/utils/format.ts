// Shared amount/date formatting. Locale drives number-grouping/decimal and
// date-shape conventions everywhere; currency symbol always comes from the
// specific account/transaction/obligation being displayed (falling back to
// the app's default currency only where nothing more specific applies, e.g.
// Obligations) — this never overrides a real account's own currency.

export function formatAmount(amount: number | null | undefined, symbol?: string | null, locale?: string): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const formatted = amount.toLocaleString(locale || 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol} ${formatted}` : formatted;
}

export function formatDate(value: string | Date | null | undefined, locale?: string): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale || 'en-US', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
