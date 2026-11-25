import {
  convertPack,
  costBand,
  dishKey,
  effectiveMenuRowPrice,
  findRecipeIssues,
  formatInr,
  invoiceTotalCheck,
  marginDiff,
  matchName,
  normalizeName,
  ONBOARDING_STEP_CODES,
  ONBOARDING_STEPS,
  parsePackSize,
  plateCost,
  portionFactorForVariant,
  suggestMerges,
} from '@rms/api-contract';

import { numberToStep, stepToNumber } from '../onboarding/onboarding.service';

describe('costing (shared with the web app)', () => {
  it('costs a plate from base-unit prices', () => {
    const { total, missingPrices } = plateCost([
      { quantity: 180, unit: 'G', pricePerBase: 0.34 },
      { quantity: 0.25, unit: 'UNIT', pricePerBase: 6 },
      { quantity: 0.01, unit: 'L', pricePerBase: 0.14 },
      { quantity: 15, unit: 'G', pricePerBase: null },
    ]);
    expect(total).toBeCloseTo(61.2 + 1.5 + 1.4, 5);
    expect(missingPrices).toBe(1);
  });

  it('bands food cost relative to the restaurant target', () => {
    expect(costBand(33, { min: 30, max: 35 })).toBe('healthy');
    expect(costBand(42, { min: 30, max: 35 })).toBe('watch');
    expect(costBand(42.1, { min: 30, max: 35 })).toBe('poor');
    expect(costBand(28, { min: 20, max: 25 })).toBe('watch');
  });

  it('converts packs to base units', () => {
    expect(convertPack({ quantity: 5, packSize: 1, packUnit: 'KG' })).toEqual({
      base: 5000,
      baseUnit: 'G',
    });
    expect(convertPack({ quantity: 1, packSize: 15, packUnit: 'L' })).toEqual({
      base: 15000,
      baseUnit: 'ML',
    });
    expect(convertPack({ quantity: 2, packSize: null, packUnit: null })).toBeNull();
  });

  it('checks invoice totals within ₹1', () => {
    const lines = [2090, 1160, 735, 1980, 1560, 860, 1425, 264, 620];
    const ok = invoiceTotalCheck({
      lineAmounts: lines,
      cgst: 267.35,
      sgst: 267.35,
      igst: null,
      roundOff: 0.3,
      total: 11229,
    });
    expect(ok).toMatchObject({ ok: true, delta: 0 });
    const off = invoiceTotalCheck({
      lineAmounts: lines,
      cgst: 267.35,
      sgst: 267.35,
      igst: null,
      roundOff: 0.3,
      total: 11300,
    });
    expect(off.ok).toBe(false);
    expect(
      invoiceTotalCheck({
        lineAmounts: lines,
        cgst: null,
        sgst: null,
        igst: null,
        roundOff: null,
        total: null,
      }).ok,
    ).toBe(false);
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatInr(124350)).toBe('₹1,24,350');
    expect(formatInr(13960, 2)).toBe('₹13,960.00');
    expect(formatInr(999)).toBe('₹999');
    expect(formatInr(12345678)).toBe('₹1,23,45,678');
  });

  it('reports margin changes, biggest first', () => {
    const changes = marginDiff(
      [
        { key: 'a', name: 'Paneer Tikka', foodCostPct: 31 },
        { key: 'b', name: 'Naan', foodCostPct: 20 },
        { key: 'c', name: 'Dal', foodCostPct: 27 },
      ],
      [
        { key: 'a', name: 'Paneer Tikka', foodCostPct: 36 },
        { key: 'b', name: 'Naan', foodCostPct: 18 },
        { key: 'c', name: 'Dal', foodCostPct: 27.2 },
      ],
    );
    expect(changes.map((change) => change.key)).toEqual(['a', 'b']);
  });

  it('infers portion factors', () => {
    expect(portionFactorForVariant('Half')).toBe(0.5);
    expect(portionFactorForVariant('Full')).toBe(1);
    expect(portionFactorForVariant('Quarter')).toBe(0.25);
    expect(portionFactorForVariant('Family pack')).toBe(1);
  });
});

describe('ingredient matching', () => {
  const ingredients = [
    { key: 'p', name: 'Paneer' },
    { key: 'c', name: 'Curd', aliases: ['dahi', 'yogurt'] },
    { key: 'b', name: 'Butter' },
  ];

  it('normalises invoice text', () => {
    expect(normalizeName('AMUL PANEER 1KG x5')).toBe('amul paneer');
    expect(dishKey('Paneer Tikka (Tandoori)')).toBe('paneer tikka');
  });

  it('matches invoice lines to ingredients, aliases included', () => {
    expect(matchName('AMUL PANEER 1KG', ingredients)[0]).toMatchObject({ key: 'p' });
    expect(matchName('Mother Dairy Dahi 1kg', ingredients)[0]).toMatchObject({ key: 'c' });
    expect(matchName('Sugar 5kg', ingredients)).toEqual([]);
  });

  it('suggests merges for synonyms and near-duplicates', () => {
    const merges = suggestMerges(
      [
        { key: '1', name: 'Curd' },
        { key: '2', name: 'Dahi' },
        { key: '3', name: 'Cooking oil' },
        { key: '4', name: 'Cooking Oil.' },
      ],
      [['Curd', 'Dahi', 'Yogurt']],
    );
    expect(merges).toEqual([
      { keep: '1', merge: '2', score: 100, reason: 'alias' },
      expect.objectContaining({ keep: '3', merge: '4', reason: 'similar' }),
    ]);
  });

  it('reads pack sizes from descriptions', () => {
    expect(parsePackSize('FORTUNE SUNFLOWER OIL 15L')).toEqual({ size: 15, unit: 'L' });
    expect(parsePackSize('MDH GARAM MASALA 500G')).toEqual({ size: 500, unit: 'G' });
    expect(parsePackSize('Lemons')).toBeNull();
  });
});

describe('onboarding contract', () => {
  it('stores steps under fixed codes, so a new step never shifts saved drafts', () => {
    expect(ONBOARDING_STEP_CODES).toEqual({
      details: 1,
      floor: 2,
      menu: 3,
      inventory: 4,
      team: 5,
      review: 6,
      recipes: 7,
    });
    for (const step of ONBOARDING_STEPS) expect(numberToStep(stepToNumber(step))).toBe(step);
    expect(stepToNumber(null)).toBe(0);
    expect(numberToStep(0)).toBeNull();
    expect(numberToStep(4)).toBe('inventory');
  });

  it('uses the dearest portion as the price of an item with portions', () => {
    expect(
      effectiveMenuRowPrice({
        price: '',
        variants: [
          { key: 'h', name: 'Half', price: '180' },
          { key: 'f', name: 'Full', price: '320' },
        ],
      }),
    ).toBe('320');
    expect(effectiveMenuRowPrice({ price: '300', variants: [] })).toBe('300');
  });

  it('checks recipe lines but not "No recipe needed" dishes', () => {
    const issues = findRecipeIssues({
      dishes: [
        {
          menuRowKey: 'a',
          status: 'draft',
          lines: [
            { key: '1', ingredient: 'Paneer', quantity: '0', unit: 'G' },
            { key: '2', ingredient: 'paneer', quantity: '10', unit: 'BOX' },
          ],
        },
        {
          menuRowKey: 'b',
          status: 'no-recipe',
          lines: [{ key: '3', ingredient: '', quantity: '', unit: '' }],
        },
      ],
    });
    expect(issues.map((issue) => `${issue.lineIndex}:${issue.field}`)).toEqual([
      '0:quantity',
      '1:ingredient',
      '1:unit',
    ]);
  });
});
