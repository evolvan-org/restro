import { dishKey } from '@rms/api-contract';

import {
  boxFromModel,
  decimalOrNull,
  mapInvoiceLine,
  mapMenuRow,
  mergeInvoiceHeader,
} from './row-mapping';

describe('row mapping', () => {
  it('normalises prices and rejects non-numbers', () => {
    expect(decimalOrNull('₹ 1,250.00')).toBe('1250.00');
    expect(decimalOrNull('Rs. 90')).toBe('90');
    expect(decimalOrNull('2Z0')).toBeNull();
    expect(decimalOrNull(45)).toBe('45');
  });

  it('converts a Gemini box to a normalised page region', () => {
    expect(boxFromModel([100, 50, 200, 950], 2)).toEqual({
      page: 2,
      x: 0.05,
      y: 0.1,
      w: 0.9,
      h: 0.1,
    });
    expect(boxFromModel([200, 50, 100, 950], 1)).toBeNull();
    expect(boxFromModel('nope', 1)).toBeNull();
  });

  describe('menu rows', () => {
    const base = {
      kind: 'dish',
      category: 'Starters',
      type: 'FOOD',
      diet: 'VEG',
      confidence: 93,
      variants: [],
      issues: [],
    };

    it('keeps a valid dish', () => {
      const row = mapMenuRow(
        { ...base, name: 'Paneer Tikka', price: '280' },
        1,
        dishKey,
        new Map(),
      );
      expect(row).toMatchObject({
        name: 'Paneer Tikka',
        price: '280',
        dietType: 'VEG',
        flag: 'dish',
      });
    });

    it('flags a dish it already saw as a likely duplicate', () => {
      const seen = new Map<string, string>();
      mapMenuRow({ ...base, name: 'Paneer Tikka', price: '280' }, 1, dishKey, seen);
      const again = mapMenuRow(
        { ...base, name: 'Paneer Tikka (Tandoori)', price: '290' },
        1,
        dishKey,
        seen,
      );
      expect(again).toMatchObject({
        flag: 'duplicate',
        flagNote: 'Looks the same as Paneer Tikka.',
      });
    });

    it('marks headers and notes as not dishes', () => {
      const row = mapMenuRow(
        { ...base, kind: 'note', name: 'Prices inclusive of taxes' },
        1,
        dishKey,
        new Map(),
      );
      expect(row?.flag).toBe('not_a_dish');
    });

    it('moves portion prices to variants and lowers confidence without a price', () => {
      const portions = mapMenuRow(
        {
          ...base,
          name: 'Chicken Tikka',
          price: '320',
          variants: [
            { name: 'Half', price: '180' },
            { name: 'Full', price: '320' },
          ],
        },
        1,
        dishKey,
        new Map(),
      );
      expect(portions).toMatchObject({
        price: null,
        variants: [{ name: 'Half' }, { name: 'Full' }],
      });

      const priceless = mapMenuRow({ ...base, name: 'Thali' }, 1, dishKey, new Map());
      expect(priceless?.confidence).toBeLessThanOrEqual(60);
      expect(priceless?.issues.join(' ')).toMatch(/price/i);
    });

    it('drops a row without a name and unknown diets become null', () => {
      expect(mapMenuRow({ ...base, name: '  ' }, 1, dishKey, new Map())).toBeNull();
      expect(
        mapMenuRow({ ...base, name: 'Soup', price: '90', diet: 'UNKNOWN' }, 1, dishKey, new Map())
          ?.dietType,
      ).toBeNull();
    });
  });

  describe('invoices', () => {
    it('maps a line with its pack size', () => {
      const line = mapInvoiceLine(
        {
          rawText: 'AMUL PANEER 1KG',
          description: 'Amul Paneer',
          quantity: '5',
          packSize: '1',
          packUnit: 'KG',
          amount: '2,090.00',
          confidence: 93,
        },
        1,
      );
      expect(line).toMatchObject({
        quantity: '5',
        packSize: '1',
        packUnit: 'KG',
        amount: '2090.00',
      });
    });

    it('fills header fields across pages without overwriting earlier ones', () => {
      const first = mergeInvoiceHeader(null, {
        supplierName: 'Shree Ganesh',
        invoiceNumber: 'A1',
        total: null,
        confidence: 90,
      });
      const merged = mergeInvoiceHeader(first, {
        supplierName: 'Other',
        total: '11,229.00',
        supplierGstin: '27abcde1234f1z5',
        confidence: 80,
      });
      expect(merged).toMatchObject({
        supplierName: 'Shree Ganesh',
        invoiceNumber: 'A1',
        total: '11229.00',
        supplierGstin: '27ABCDE1234F1Z5',
        confidence: 80,
      });
    });
  });
});
