/**
 * Indian rupee formatting with lakh grouping (₹1,23,456). Accepts a decimal string or number.
 * Whole amounts drop the paise unless `paise: 'always'`.
 */
export function formatRupees(
  value: string | number,
  options: { paise?: 'auto' | 'always' | 'never' } = {},
): string {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  const mode = options.paise ?? 'auto';
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const fixed = absolute.toFixed(2);
  const [rupees = '0', paise = '00'] = fixed.split('.');
  const grouped =
    rupees.length > 3
      ? `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`
      : rupees;
  const showPaise = mode === 'always' || (mode === 'auto' && paise !== '00');
  const body =
    mode === 'never'
      ? groupWhole(Math.round(absolute))
      : showPaise
        ? `${grouped}.${paise}`
        : grouped;
  return `${negative ? '-' : ''}₹${body}`;
}

function groupWhole(value: number): string {
  const rupees = String(value);
  return rupees.length > 3
    ? `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`
    : rupees;
}
