import {
  type AiProvider,
  type AiRequest,
  type AiStreamChunk,
  AiStreamInterruptedError,
  AiUnavailableError,
  type AiUsage,
  collectStream,
} from './ai-provider';

/*
 * Canned AI output for development, CI, tests and offline sales demos. Streams the JSON in small
 * chunks with delays so the live row-by-row UI behaves as it will with a real model. All names,
 * GSTINs and numbers are fictional demo data.
 */

export type FakeScenario = 'ok' | 'unreadable' | 'partial' | 'unavailable' | 'flaky';

type FakeRow = [
  name: string,
  diet: string,
  price: string | null,
  category: string,
  extra?: Record<string, unknown>,
];

const MENU_PAGES: FakeRow[][] = [
  [
    ['Paneer Tikka', 'VEG', '280', 'Starters', { originalName: 'पनीर टिक्का' }],
    ['Chilli Paneer Dry', 'VEG', '260', 'Starters'],
    [
      'Veg Manchurian',
      'VEG',
      '220',
      'Starters',
      {
        confidence: 58,
        issues: ['Price read as "2Z0". Suggested ₹220.'],
        rawText: 'Veg Manchurian ...... 2Z0',
      },
    ],
    ['Hara Bhara Kebab', 'VEG', '240', 'Starters', { originalName: 'हरा भरा कबाब' }],
    [
      'Chicken Tikka',
      'NON_VEG',
      null,
      'Starters',
      {
        variants: [
          { name: 'Half', price: '180' },
          { name: 'Full', price: '320' },
        ],
        confidence: 69,
        issues: ['Half price is smudged. Suggested Half ₹180, Full ₹320.'],
        rawText: 'Chicken Tikka H 1?0 F 320',
      },
    ],
    [
      'Egg Bhurji',
      'EGG',
      '160',
      'Starters',
      { confidence: 68, issues: ['Marker looks Non-veg. Dish name says egg. Suggested Egg.'] },
    ],
    ['Paneer Tikka (Tandoori)', 'VEG', '290', 'Starters'],
    ['Crispy Corn', 'VEG', '210', 'Starters'],
  ],
  [
    ['Dal Makhani', 'VEG', '240', 'Main Course', { originalName: 'दाल मखनी' }],
    ['Paneer Butter Masala', 'VEG', '290', 'Main Course'],
    [
      'Butter Chicken',
      'NON_VEG',
      null,
      'Main Course',
      {
        variants: [
          { name: 'Half', price: '220' },
          { name: 'Full', price: '340' },
        ],
      },
    ],
    ['Mutton Rogan Josh', 'NON_VEG', '420', 'Main Course'],
    ['Egg Curry', 'EGG', '190', 'Main Course'],
    ['Chicken Biryani', 'NON_VEG', '310', 'Main Course'],
    ['Palak Paneer', 'VEG', '280', 'Main Course'],
    ['Kadai Paneer', 'VEG', '290', 'Main Course'],
  ],
  [
    ['Butter Naan', 'VEG', '60', 'Breads & Rice'],
    [
      'Tandoori Roti',
      'VEG',
      '25',
      'Breads & Rice',
      {
        confidence: 64,
        issues: ['Price read as "2S". Suggested ₹25.'],
        rawText: 'Tandoori Roti ..... 2S',
      },
    ],
    [
      'Jeera Rice',
      'VEG',
      '140',
      'Breads & Rice',
      { confidence: 62, issues: ['Price read as "14O". Suggested ₹140.'] },
    ],
    [
      'Misal Pav',
      'VEG',
      '120',
      'Breads & Rice',
      {
        originalName: 'मिसळ पाव',
        confidence: 66,
        issues: ['Veg or egg? Marker is unclear in the photo. Suggested Veg.'],
      },
    ],
    ['Garlic Naan', 'VEG', '80', 'Breads & Rice'],
    ['Veg Biryani', 'VEG', '240', 'Breads & Rice'],
  ],
  [
    ['Masala Chai', 'VEG', '40', 'Drinks'],
    [
      'Sweet Lassi',
      'VEG',
      '90',
      'Drinks',
      { confidence: 73, issues: ['Category unclear: Drinks or Desserts? Suggested Drinks.'] },
    ],
    [
      'Fresh Lime Soda',
      'VEG',
      '70',
      'Drinks',
      { confidence: 71, issues: ['Type unclear. Suggested BAR (drinks counter).'] },
    ],
    ['Bottled Water', 'VEG', '20', 'Drinks'],
    ['Gulab Jamun', 'VEG', '90', 'Desserts'],
    ['Rasmalai', 'VEG', '110', 'Desserts'],
  ],
];
const PAGE_TITLES = ['Starters', 'Main Course', 'Breads & Rice', 'Drinks & Desserts'];

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });

function pageOf(prompt: string): { page: number; pages: number } {
  const match = /page (\d+) of (\d+)/.exec(prompt);
  return { page: Number(match?.[1] ?? 1), pages: Number(match?.[2] ?? 1) };
}

function menuRow(
  [name, diet, price, category, extra = {}]: FakeRow,
  index: number,
): Record<string, unknown> {
  const y = 120 + index * 95;
  return {
    kind: 'dish',
    category,
    type: category === 'Drinks' ? 'BAR' : 'FOOD',
    name,
    originalName: null,
    diet,
    price,
    variants: [],
    description: null,
    confidence: 88 + ((index * 7) % 12),
    issues: [],
    rawText: `${name} ...... ${price ?? ''}`,
    box: [y, 60, y + 60, 940],
    ...extra,
  };
}

function menuPage(prompt: string, scenario: FakeScenario): Record<string, unknown> {
  const { page } = pageOf(prompt);
  if (scenario === 'unreadable' || (scenario === 'partial' && page === 2)) {
    return { documentType: 'menu', quality: 'blurry', title: null, rows: [] };
  }
  const rows = (MENU_PAGES[(page - 1) % MENU_PAGES.length] ?? []).map(menuRow);
  if (page === 1) {
    rows.push({
      kind: 'note',
      category: '',
      type: 'FOOD',
      name: '★ All prices inclusive of taxes ★',
      originalName: null,
      diet: 'UNKNOWN',
      price: null,
      variants: [],
      description: null,
      confidence: 95,
      issues: [],
      rawText: '★ All prices inclusive of taxes ★',
      box: [930, 200, 970, 800],
    });
    rows.unshift({
      kind: 'header',
      category: '',
      type: 'FOOD',
      name: 'स्टार्टर्स / STARTERS',
      originalName: null,
      diet: 'UNKNOWN',
      price: null,
      variants: [],
      description: null,
      confidence: 96,
      issues: [],
      rawText: 'स्टार्टर्स / STARTERS',
      box: [60, 300, 100, 700],
    });
  }
  return {
    documentType: 'menu',
    quality: 'ok',
    title: PAGE_TITLES[(page - 1) % PAGE_TITLES.length],
    rows,
  };
}

function invoicePage(prompt: string, scenario: FakeScenario): Record<string, unknown> {
  const { page } = pageOf(prompt);
  if (scenario === 'unreadable' || (scenario === 'partial' && page === 2)) {
    return { documentType: 'invoice', quality: 'blurry', title: null, header: null, lines: [] };
  }
  const lines = [
    ['AMUL PANEER 1KG', 'Amul Paneer', '0406', '5', '1', 'KG', '418.00', '2090.00'],
    ['AMUL BUTTER 500G', 'Amul Butter', '0405', '4', '500', 'G', '290.00', '1160.00'],
    ['FRESH CREAM 1L', 'Fresh Cream', '0401', '3', '1', 'L', '245.00', '735.00'],
    ['FORTUNE SUNFLOWER OIL 15L', 'Sunflower Oil', '1512', '1', '15', 'L', '1980.00', '1980.00'],
    ['CASHEW W320 1KG', 'Cashew', '0801', '2', '1', 'KG', '780.00', '1560.00'],
    ['AASHIRVAAD ATTA 10KG', 'Atta', '1101', '2', '10', 'KG', '430.00', '860.00'],
    ['INDIA GATE BASMATI 5KG', 'Basmati Rice', '1006', '3', '5', 'KG', '475.00', '1425.00'],
    ['HUNG CURD 1KG', 'Hung Curd', '0403', '4', '1', 'KG', '66.00', '264.00'],
    ['MDH GARAM MASALA 500G', 'Garam Masala', '0910', '2', '500', 'G', '310.00', '620.00'],
  ].map(([rawText, description, hsn, quantity, packSize, packUnit, unitRate, amount], index) => ({
    rawText,
    description,
    hsn,
    quantity,
    packSize,
    packUnit,
    unitRate,
    amount,
    batchNumber: index === 0 ? 'AP2611' : null,
    expiryDate: index === 0 ? '2026-12-08' : null,
    confidence: index === 4 ? 72 : 93,
    box: [300 + index * 50, 40, 340 + index * 50, 960],
  }));
  // Lines 10,694 + CGST 2.5% 267.35 + SGST 2.5% 267.35 + round-off 0.30 = 11,229.00
  return {
    documentType: 'invoice',
    quality: 'ok',
    title: 'Tax Invoice',
    header: {
      supplierName: 'Shree Ganesh Dairy & Provisions',
      supplierGstin: '27ABCDE1234F1Z5',
      invoiceNumber: 'SGD/2611/0427',
      invoiceDate: '2026-11-24',
      subtotal: '10694.00',
      cgst: '267.35',
      sgst: '267.35',
      igst: null,
      roundOff: '0.30',
      total: '11229.00',
      confidence: 94,
    },
    lines,
  };
}

const RECIPE_HINTS: [RegExp, [string, string, string][]][] = [
  [
    /paneer/i,
    [
      ['Paneer', '150', 'G'],
      ['Onion', '40', 'G'],
      ['Tomato', '50', 'G'],
      ['Cooking oil', '15', 'ML'],
      ['Garam masala', '3', 'G'],
    ],
  ],
  [
    /chicken/i,
    [
      ['Chicken boneless', '200', 'G'],
      ['Hung curd', '40', 'G'],
      ['Ginger-garlic paste', '15', 'G'],
      ['Cooking oil', '15', 'ML'],
      ['Tandoori masala', '8', 'G'],
    ],
  ],
  [
    /mutton/i,
    [
      ['Mutton', '200', 'G'],
      ['Onion', '60', 'G'],
      ['Curd', '40', 'G'],
      ['Ghee', '15', 'G'],
      ['Kashmiri chilli powder', '5', 'G'],
    ],
  ],
  [
    /egg/i,
    [
      ['Egg', '3', 'UNIT'],
      ['Onion', '40', 'G'],
      ['Tomato', '40', 'G'],
      ['Cooking oil', '10', 'ML'],
    ],
  ],
  [
    /dal/i,
    [
      ['Black lentils', '60', 'G'],
      ['Butter', '20', 'G'],
      ['Cream', '25', 'ML'],
      ['Tomato puree', '60', 'G'],
    ],
  ],
  [
    /naan|roti|paratha/i,
    [
      ['Atta', '80', 'G'],
      ['Hung curd', '15', 'G'],
      ['Butter', '8', 'G'],
    ],
  ],
  [
    /rice|biryani|pulao/i,
    [
      ['Basmati rice', '120', 'G'],
      ['Ghee', '10', 'G'],
      ['Cumin seeds', '2', 'G'],
    ],
  ],
  [
    /chai|tea/i,
    [
      ['Milk', '100', 'ML'],
      ['Tea leaves', '4', 'G'],
      ['Sugar', '12', 'G'],
    ],
  ],
  [
    /lassi/i,
    [
      ['Curd', '200', 'G'],
      ['Sugar', '25', 'G'],
    ],
  ],
  [
    /lime soda/i,
    [
      ['Lemon', '1', 'UNIT'],
      ['Soda', '250', 'ML'],
      ['Sugar', '15', 'G'],
    ],
  ],
  [
    /manchurian|corn|chilli/i,
    [
      ['Cabbage', '80', 'G'],
      ['Cornflour', '20', 'G'],
      ['Soy sauce', '10', 'ML'],
      ['Cooking oil', '30', 'ML'],
    ],
  ],
  [
    /gulab|rasmalai|dessert/i,
    [
      ['Khoya', '40', 'G'],
      ['Sugar', '40', 'G'],
      ['Ghee', '20', 'G'],
    ],
  ],
];

function recipes(prompt: string): Record<string, unknown> {
  const dishes = [...prompt.matchAll(/- ref (\S+): ([^(\n]+)/g)].map((match) => ({
    ref: match[1]!,
    name: match[2]!.trim(),
  }));
  return {
    recipes: dishes.map(({ ref, name }) => {
      if (/bottled|water|soft drink|cola/i.test(name)) {
        return {
          ref,
          noRecipeNeeded: true,
          lines: [],
          note: 'Bought in and resold as-is.',
          confidence: 96,
        };
      }
      const hint = RECIPE_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? [
        ['Onion', '50', 'G'],
        ['Tomato', '50', 'G'],
        ['Cooking oil', '15', 'ML'],
        ['Garam masala', '3', 'G'],
      ];
      return {
        ref,
        noRecipeNeeded: false,
        lines: hint.map(([ingredient, quantity, unit], index) => ({
          ingredient,
          quantity,
          unit,
          confidence: index === hint.length - 1 ? 70 : 88,
        })),
        note: 'Standard restaurant portion.',
        confidence: 84,
      };
    }),
  };
}

function prices(prompt: string): Record<string, unknown> {
  const names = [...prompt.matchAll(/^- (.+)$/gm)].map((match) => match[1]!.trim());
  return { items: names.map((name) => ({ name, known: true, baseUnit: 'G', price: '250' })) };
}

export class FakeProvider implements AiProvider {
  readonly name = 'fake';

  /** `flaky`: streams started per task; every other one is dropped. */
  private readonly streams = new Map<string, number>();

  constructor(
    private readonly scenario: FakeScenario = 'ok',
    private readonly chunkDelayMs = 110,
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamChunk> {
    if (this.scenario === 'unavailable')
      throw new AiUnavailableError('Fake provider is set to unavailable');
    const body =
      request.task === 'menu-page'
        ? menuPage(request.prompt, this.scenario)
        : request.task === 'invoice-page'
          ? invoicePage(request.prompt, this.scenario)
          : request.task === 'recipes'
            ? recipes(request.prompt)
            : prices(request.prompt);
    const text = JSON.stringify(body);
    // Roughly one row per ~400 ms, like a real streamed read.
    const chunkSize = 90;
    // `flaky` drops every other stream of a task halfway, like Gemini closing it mid-event, so
    // each drop is followed by one clean read (the resume).
    const started = (this.streams.get(request.task) ?? 0) + 1;
    this.streams.set(request.task, started);
    const dropAt =
      this.scenario === 'flaky' && started % 2 === 1 ? Math.floor(text.length / 2) : Infinity;
    for (let index = 0; index < text.length; index += chunkSize) {
      if (index >= dropAt) {
        throw new AiStreamInterruptedError('Fake provider dropped the stream');
      }
      await sleep(request.task === 'ingredient-prices' ? 0 : this.chunkDelayMs, request.signal);
      yield { text: text.slice(index, index + chunkSize) };
    }
    const usage: AiUsage = { inputTokens: 1200, outputTokens: Math.ceil(text.length / 4) };
    yield { usage };
  }

  async generate(request: AiRequest): Promise<{ text: string; usage: AiUsage }> {
    try {
      return await collectStream(this.stream(request));
    } catch (error) {
      // Same contract as Gemini: an interrupted whole-response request is simply asked again.
      if (!(error instanceof AiStreamInterruptedError)) throw error;
      return collectStream(this.stream(request));
    }
  }
}
