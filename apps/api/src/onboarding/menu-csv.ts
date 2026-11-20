import { BadRequestException } from '@nestjs/common';
import {
  MENU_CSV_COLUMNS,
  MENU_CSV_REQUIRED_COLUMNS,
  ONBOARDING_MENU_MAX_ROWS,
  type OnboardingMenuRow,
} from '@rms/api-contract';

import { readInventoryCsv, unescapeInventoryCsvText } from '../stock/inventory-csv';

const allowedColumns = new Set<string>(MENU_CSV_COLUMNS);
const unavailableValues = new Set(['false', 'no', 'n', '0']);

/**
 * Reads a menu CSV (`category, type, name, price, description, available`) into editable onboarding
 * rows. Problems with the file as a whole are thrown; row problems are left for the shared issue
 * finder, so the owner can fix them inline instead of re-uploading.
 */
export function menuCsvRows(file: Buffer, key: () => string): OnboardingMenuRow[] {
  const [header, ...rows] = readInventoryCsv(file, ONBOARDING_MENU_MAX_ROWS + 1, 'menu');
  if (!header || !rows.length) {
    throw new BadRequestException('CSV must contain a header and at least one menu row');
  }
  const columns = header.values.map((value) => value.trim().toLowerCase().replace(/\*$/, ''));
  if (new Set(columns).size !== columns.length) {
    throw new BadRequestException('CSV contains duplicate column names');
  }
  const missing = MENU_CSV_REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length) throw new BadRequestException(`Missing CSV columns: ${missing.join(', ')}`);
  const unknown = columns.filter((name) => !allowedColumns.has(name));
  if (unknown.length) {
    throw new BadRequestException(`Unrecognized CSV columns: ${unknown.join(', ')}`);
  }

  return rows.map(({ values, line }) => {
    const get = (name: string): string => values[columns.indexOf(name)] ?? '';
    const available = get('available').trim().toLowerCase();
    return {
      key: key(),
      line,
      category: unescapeInventoryCsvText(get('category')).trim(),
      type: get('type').trim().toUpperCase(),
      name: unescapeInventoryCsvText(get('name')).trim(),
      price: get('price')
        .trim()
        .replace(/^[₹$]\s*/, ''),
      description: unescapeInventoryCsvText(get('description')).trim(),
      // Blank means available; only an explicit "no" hides an item.
      available: !unavailableValues.has(available),
    };
  });
}
