/**
 * Currency formatting utilities for multi-tenant USD/CAD support.
 */

export type SupportedCurrency = 'USD' | 'CAD';

/**
 * Format a numeric amount as a locale-aware currency string.
 * @param amount - Amount in dollars (e.g. 29.99)
 * @param currency - 'USD' or 'CAD'
 * @param locale - BCP 47 locale (defaults to en-US for USD, en-CA for CAD)
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency | string = 'USD',
  locale?: string
): string {
  const resolvedLocale = locale ?? (currency === 'CAD' ? 'en-CA' : 'en-US');
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format as compact currency (no cents when whole dollar, e.g. "$1,200").
 */
export function formatCurrencyCompact(
  amount: number,
  currency: SupportedCurrency | string = 'USD'
): string {
  const resolvedLocale = currency === 'CAD' ? 'en-CA' : 'en-US';
  const hasDecimals = amount % 1 !== 0;
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
}

/** Returns the currency symbol for display (e.g. "$" or "CA$"). */
export function getCurrencySymbol(currency: SupportedCurrency | string = 'USD'): string {
  const locale = currency === 'CAD' ? 'en-CA' : 'en-US';
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? '$'
  );
}

/** Returns the Stripe-accepted lowercase currency code. */
export function toStripeCurrency(currency: SupportedCurrency | string): string {
  return currency.toLowerCase();
}
