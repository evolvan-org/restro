import type { PortionStyle } from '@rms/api-contract';

/*
 * Prompts and response schemas (Gemini's OpenAPI subset). Model output is never trusted: every
 * element is validated with Zod after mapping (see the handlers), and anything uncertain is
 * flagged for the owner rather than corrected silently.
 */

const str = (description?: string, nullable = false) => ({
  type: 'STRING',
  ...(description && { description }),
  ...(nullable && { nullable: true }),
});
const int = (description?: string) => ({ type: 'INTEGER', ...(description && { description }) });
const box = {
  type: 'ARRAY',
  items: { type: 'INTEGER' },
  description:
    'Bounding box of the printed line on the page: [ymin, xmin, ymax, xmax], each 0–1000',
};
const pageFields = {
  documentType: { type: 'STRING', enum: ['menu', 'invoice', 'other'] },
  quality: {
    type: 'STRING',
    enum: ['ok', 'blurry', 'cropped', 'dark', 'cluttered', 'unreadable'],
    description:
      'Whether every line can be read reliably. Decide it before reading any rows: rows are not read when the page is blurry, cluttered or unreadable',
  },
  title: str('Main section heading on this page, if any', true),
};

// ---------------------------------------------------------------------------------------------
// Menu page
// ---------------------------------------------------------------------------------------------

/** Judge the page before reading it, so an unusable page costs no row output. */
const PAGE_CHECK = (document: 'menu' | 'invoice') => `First judge the page, before any rows:
- documentType: "${document}" for any ${document} with real content, however it was designed (printed, handwritten, or made from a design template with real names and prices). Use "other" only for a different kind of document, or when the content itself is placeholder: Latin filler text (lorem ipsum, "Exercitation", "Nostrud minim"), "Item name" style labels, or prices that are all 0.00 / 00 / $0.
- quality: "blurry" if the text is out of focus; "cluttered" if the text is too small, too dense or too decorative (illustrations and fancy lettering over the text) to read every line and price with certainty at this resolution; "dark" or "cropped" if so; otherwise "ok".
- If documentType is not "${document}", or quality is "blurry", "cluttered" or "unreadable", return an empty list and stop: do not guess at lines you can't read with certainty.`;

export const MENU_SYSTEM = `You read photos of Indian restaurant menus and return structured JSON.
${PAGE_CHECK('menu')}
Rules:
- One row per printed line. Section headings, taglines, tax notes ("prices inclusive of taxes"), timings and phone numbers are rows with kind "header" or "note", never "dish".
- name: clean English title case ("Paneer Tikka"). originalName: the text exactly as printed when it is not plain English (Hindi, regional script, Hinglish spelling), else null.
- category: the section heading the dish sits under, in English title case.
- type: "BAR" only for drinks served from a bar (alcohol, mocktails, soft drinks, juices, lassi, tea and coffee also count as BAR); everything else "FOOD".
- diet: from the printed veg/non-veg marker (green square/dot = VEG, red/brown triangle or dot = NON_VEG), else infer from the dish name (egg dishes = EGG); "UNKNOWN" if truly unclear.
- price: digits only as a decimal string, no currency symbol. If the dish has portion prices (Half/Full, Small/Large, Quarter), put each in variants and set price to null.
- Never invent a price. If a digit is unclear, give your best reading, lower confidence, and add an issue such as: Price read as "2Z0". Suggested ₹220.
- confidence: 0–100 for the whole row. Lower it for any unclear field and explain each doubt in issues (max 3, short, plain English).
- rawText: the printed line as you read it.
- Return rows in reading order.`;

export function menuPagePrompt(page: number, pages: number): string {
  return `This is page ${page} of ${pages} of the menu. Read every line on this page.`;
}

export const MENU_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...pageFields,
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['dish', 'header', 'note'] },
          category: str(),
          type: { type: 'STRING', enum: ['FOOD', 'BAR'] },
          name: str(),
          originalName: str(undefined, true),
          diet: { type: 'STRING', enum: ['VEG', 'NON_VEG', 'EGG', 'UNKNOWN'] },
          price: str('Decimal string, digits only', true),
          variants: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { name: str(), price: str() },
              required: ['name', 'price'],
              propertyOrdering: ['name', 'price'],
            },
          },
          description: str(undefined, true),
          confidence: int('0-100'),
          issues: { type: 'ARRAY', items: str() },
          rawText: str(undefined, true),
          box,
        },
        required: ['kind', 'category', 'type', 'name', 'diet', 'confidence', 'variants', 'issues'],
        propertyOrdering: [
          'kind',
          'category',
          'type',
          'name',
          'originalName',
          'diet',
          'price',
          'variants',
          'description',
          'confidence',
          'issues',
          'rawText',
          'box',
        ],
      },
    },
  },
  required: ['documentType', 'quality', 'rows'],
  propertyOrdering: ['documentType', 'quality', 'title', 'rows'],
};

// ---------------------------------------------------------------------------------------------
// Invoice page
// ---------------------------------------------------------------------------------------------

export const INVOICE_SYSTEM = `You read photos of Indian supplier GST invoices (printed, thermal or handwritten) and return structured JSON.
${PAGE_CHECK('invoice')}
Rules:
- header: supplier name, supplier GSTIN (15 characters), invoice number, invoice date as YYYY-MM-DD, subtotal, CGST, SGST, IGST, round-off and grand total. Amounts as decimal strings with no currency symbol or commas. Use null for anything not printed on this page.
- lines: one per purchased item. rawText = the line as printed. description = the item in plain words ("Amul Paneer"). quantity = number of packs or units bought. packSize + packUnit = size of one pack when printed (for "AMUL PANEER 1KG x5": quantity 5, packSize 1, packUnit KG). Units: G, KG, ML, L, UNIT. unitRate = price per pack before tax; amount = line total before tax.
- batchNumber and expiryDate only when printed.
- Never invent numbers. Lower confidence (0–100) for anything hard to read.`;

export function invoicePagePrompt(page: number, pages: number): string {
  return `This is page ${page} of ${pages} of the invoice. Read the header fields and every item line on this page.`;
}

const money = str('Decimal string', true);
export const INVOICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...pageFields,
    header: {
      type: 'OBJECT',
      properties: {
        supplierName: str(undefined, true),
        supplierGstin: str(undefined, true),
        invoiceNumber: str(undefined, true),
        invoiceDate: str('YYYY-MM-DD', true),
        subtotal: money,
        cgst: money,
        sgst: money,
        igst: money,
        roundOff: money,
        total: money,
        confidence: int('0-100'),
      },
      propertyOrdering: [
        'supplierName',
        'supplierGstin',
        'invoiceNumber',
        'invoiceDate',
        'subtotal',
        'cgst',
        'sgst',
        'igst',
        'roundOff',
        'total',
        'confidence',
      ],
    },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rawText: str(),
          description: str(),
          hsn: str(undefined, true),
          quantity: str(),
          packSize: str(undefined, true),
          packUnit: { type: 'STRING', enum: ['G', 'KG', 'ML', 'L', 'UNIT'], nullable: true },
          unitRate: money,
          amount: str(),
          batchNumber: str(undefined, true),
          expiryDate: str('YYYY-MM-DD', true),
          confidence: int('0-100'),
          box,
        },
        required: ['rawText', 'description', 'quantity', 'amount', 'confidence'],
        propertyOrdering: [
          'rawText',
          'description',
          'hsn',
          'quantity',
          'packSize',
          'packUnit',
          'unitRate',
          'amount',
          'batchNumber',
          'expiryDate',
          'confidence',
          'box',
        ],
      },
    },
  },
  required: ['documentType', 'quality', 'lines'],
  propertyOrdering: ['documentType', 'quality', 'title', 'header', 'lines'],
};

// ---------------------------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------------------------

const PORTION_HINTS: Record<PortionStyle, string> = {
  LIGHT: 'light portions (about 15% below a typical Indian restaurant)',
  STANDARD: 'standard Indian restaurant portions',
  GENEROUS: 'generous portions (about 20% above a typical Indian restaurant)',
};

export function recipeSystem(
  portionStyle: PortionStyle,
  ingredientNames: readonly string[],
): string {
  return `You are an experienced Indian restaurant chef estimating standard recipes for food costing.
For each dish give the raw ingredients for ONE plate, sized for ${PORTION_HINTS[portionStyle]}.
Rules:
- Use these ingredient names whenever one fits (exact spelling): ${ingredientNames.join(', ')}.
- Units: G for solids, ML for liquids, UNIT for countable items (eggs, lemons, pav, bottles).
- 3 to 12 lines; leave out water and anything under 1 g except saffron. Group whole spices only if they are a known mix (Garam masala).
- Bought-in items that are resold as-is (bottled water, soft drinks, packaged ice cream) need no recipe: noRecipeNeeded true and no lines.
- confidence 0–100 per line and per dish; lower it when the dish name is ambiguous or regional.
- note: one short sentence on the portion assumption (e.g. "Standard portion of 180 g paneer").`;
}

export function recipePrompt(
  dishes: readonly { ref: string; name: string; category: string; diet: string | null }[],
): string {
  const lines = dishes.map(
    (dish) =>
      `- ref ${dish.ref}: ${dish.name} (${dish.category || 'Uncategorised'}${dish.diet ? `, ${dish.diet}` : ''})`,
  );
  return `Draft one recipe per dish, keeping each ref exactly as given:\n${lines.join('\n')}`;
}

export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recipes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          ref: str(),
          noRecipeNeeded: { type: 'BOOLEAN' },
          lines: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                ingredient: str(),
                quantity: str('Decimal string'),
                unit: { type: 'STRING', enum: ['G', 'ML', 'UNIT', 'KG', 'L'] },
                confidence: int('0-100'),
              },
              required: ['ingredient', 'quantity', 'unit', 'confidence'],
              propertyOrdering: ['ingredient', 'quantity', 'unit', 'confidence'],
            },
          },
          note: str(undefined, true),
          confidence: int('0-100'),
        },
        required: ['ref', 'noRecipeNeeded', 'lines', 'confidence'],
        propertyOrdering: ['ref', 'noRecipeNeeded', 'lines', 'note', 'confidence'],
      },
    },
  },
  required: ['recipes'],
};

// ---------------------------------------------------------------------------------------------
// Ingredient prices (only for ingredients the seeded catalog doesn't know)
// ---------------------------------------------------------------------------------------------

export const PRICE_SYSTEM = `You estimate current wholesale prices of restaurant ingredients in Indian metro cities, in rupees.
Give the price per kilogram for solids, per litre for liquids, or per piece for countable items, and say which with baseUnit (G for per-kg solids, ML for per-litre liquids, UNIT for per-piece). Use a typical mid-range brand. If the name is not a food ingredient, set known false.`;

export function pricePrompt(names: readonly string[]): string {
  return `Estimate prices for:\n${names.map((name) => `- ${name}`).join('\n')}`;
}

export const PRICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: str(),
          known: { type: 'BOOLEAN' },
          baseUnit: { type: 'STRING', enum: ['G', 'ML', 'UNIT'] },
          price: str('Rupees per kg, per litre or per piece'),
        },
        required: ['name', 'known', 'baseUnit', 'price'],
        propertyOrdering: ['name', 'known', 'baseUnit', 'price'],
      },
    },
  },
  required: ['items'],
};
