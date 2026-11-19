import { BadRequestException } from '@nestjs/common';
import {
  INVENTORY_CSV_MAX_ROWS,
  type InventoryCsvItem,
  inventoryCsvItemSchema,
  type InventoryItem,
  type OpeningInventoryStock,
  openingStockSchema,
} from '@rms/api-contract';

type CsvRecord = { line: number; values: string[] };

export function encodeInventoryCsv(rows: readonly (readonly string[])[]): string {
  const contents = rows
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
        .join(','),
    )
    .join('\r\n');
  return `\uFEFF${contents}\r\n`;
}

/** Quote the cell as text in spreadsheets even when it begins with a formula operator. */
export function escapeInventoryCsvText(value: string): string {
  return /^(?:'|[\t\r\n]|0\d)|^\s*[=+\-@＝＋－＠]/u.test(value) ? `'${value}` : value;
}

export function unescapeInventoryCsvText(value: string): string {
  if (!value.startsWith("'")) return value;
  const text = value.slice(1);
  return escapeInventoryCsvText(text) === value ? text : value;
}

export function readInventoryCsv(buffer: Buffer, maxRecords: number): CsvRecord[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('Upload a UTF-8 encoded CSV file');
  }
  if (text.includes('\0')) throw new BadRequestException('CSV contains a null character');

  const records: CsvRecord[] = [];
  let line = 1;
  let recordLine = 1;
  let values: string[] = [];
  let field = '';
  let state: 'unquoted' | 'quoted' | 'closed' = 'unquoted';

  function finishField(): void {
    values.push(field);
    field = '';
    state = 'unquoted';
  }

  function finishRecord(): void {
    finishField();
    if (values.some((value) => value !== '')) {
      if (records.length >= maxRecords) {
        throw new BadRequestException(`CSV can include up to ${maxRecords - 1} ingredient rows`);
      }
      records.push({ line: recordLine, values });
    }
    values = [];
    recordLine = line + 1;
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          state = 'closed';
        }
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && text[index + 1] !== '\n')) line += 1;
      }
      continue;
    }

    if (char === ',') {
      finishField();
    } else if (char === '\n' || char === '\r') {
      finishRecord();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      line += 1;
    } else if (char === '"' && state === 'unquoted' && field === '') {
      state = 'quoted';
    } else if (char === '"' || state === 'closed') {
      throw new BadRequestException(`CSV line ${line}: Invalid quoted field`);
    } else {
      field += char;
    }
  }

  if (state === 'quoted')
    throw new BadRequestException(`CSV line ${recordLine}: Quoted field is not closed`);
  finishRecord();
  return records;
}

type IngredientRow = { line: number; item: InventoryCsvItem; opening?: OpeningInventoryStock };

const openingColumns: Record<keyof OpeningInventoryStock, string> = {
  quantity: 'opening_quantity',
  unitCost: 'opening_unit_cost',
  reason: 'opening_reason',
};

const headers = [
  'ingredient_id',
  'name',
  'sku',
  'base_unit',
  'reorder_level',
  'on_hand',
  'average_unit_cost',
  'status',
  ...Object.values(openingColumns),
] as const;
const requiredHeaders = ['name', 'base_unit', 'reorder_level'];
const allowedHeaders = new Set<string>(headers);
const csvFields: Record<keyof InventoryCsvItem, string> = {
  id: 'ingredient_id',
  name: 'name',
  sku: 'sku',
  baseUnit: 'base_unit',
  reorderLevel: 'reorder_level',
};

export function inventoryCsvString(items: readonly InventoryItem[]): string {
  return encodeInventoryCsv([
    headers,
    ...items.map((item) => [
      item.id,
      escapeInventoryCsvText(item.name),
      escapeInventoryCsvText(item.sku ?? ''),
      item.baseUnit ?? '',
      item.reorderLevel,
      item.openedAt ? item.currentStock : '',
      item.averageUnitCost ?? '',
      item.isActive ? 'ACTIVE' : 'ARCHIVED',
      ...Object.values(openingColumns).map(() => ''),
    ]),
  ]);
}

export function inventoryCsvItems(file: Buffer): IngredientRow[] {
  const [header, ...rows] = readInventoryCsv(file, INVENTORY_CSV_MAX_ROWS + 1);
  if (!header || !rows.length)
    throw new BadRequestException('CSV must contain a header and at least one ingredient row');
  const columns = header.values.map((value) => value.trim().toLowerCase());
  if (new Set(columns).size !== columns.length)
    throw new BadRequestException('CSV contains duplicate column names');
  const missing = requiredHeaders.filter((name) => !columns.includes(name));
  if (missing.length) throw new BadRequestException(`Missing CSV columns: ${missing.join(', ')}`);
  const unknown = columns.filter((name) => !allowedHeaders.has(name));
  if (unknown.length)
    throw new BadRequestException(`Unrecognized CSV columns: ${unknown.join(', ')}`);

  const foundIds = new Set<string>();
  return rows.map(({ values, line }) => {
    if (values.length !== columns.length) {
      throw new BadRequestException(`CSV line ${line}: Expected ${columns.length} columns`);
    }
    const get = (name: string) => values[columns.indexOf(name)];
    const name = get('name') ?? '';
    const sku = get('sku');
    const parsed = inventoryCsvItemSchema.safeParse({
      id: get('ingredient_id')?.trim().toLowerCase() || undefined,
      name: unescapeInventoryCsvText(name),
      sku: sku === undefined ? undefined : unescapeInventoryCsvText(sku),
      baseUnit: get('base_unit')?.trim().toUpperCase() || undefined,
      reorderLevel: get('reorder_level')?.trim(),
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map(
        ({ path, message }) => `${csvFields[path[0] as keyof InventoryCsvItem]}: ${message}`,
      );
      throw new BadRequestException(`CSV line ${line}: ${details.join('; ')}`);
    }
    const { id } = parsed.data;
    if (id && foundIds.has(id))
      throw new BadRequestException(`CSV line ${line}: Ingredient ID appears more than once`);
    if (id) foundIds.add(id);
    const opening = {
      quantity: get(openingColumns.quantity)?.trim() ?? '',
      unitCost: get(openingColumns.unitCost)?.trim() ?? '',
      reason: get(openingColumns.reason)?.trim() ?? '',
    };
    if (!Object.values(opening).some(Boolean)) return { line, item: parsed.data };

    const parsedOpening = openingStockSchema.safeParse(opening);
    if (!parsedOpening.success) {
      const details = parsedOpening.error.issues.map(
        ({ path, message }) =>
          `${openingColumns[path[0] as keyof OpeningInventoryStock]}: ${message}`,
      );
      throw new BadRequestException(`CSV line ${line}: ${details.join('; ')}`);
    }
    return { line, item: parsed.data, opening: parsedOpening.data };
  });
}
