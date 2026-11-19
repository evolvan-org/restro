/**
 * Static reference data for the seeded restaurant: floor plan, ingredient master,
 * menu with recipes, suppliers and regular guests. Quantities on stock items are
 * in the ingredient's base unit (G / ML / UNIT); costs are per base unit in INR.
 */
import type { InventoryBaseUnit, ServingType, Unit } from '@prisma/client';

export const RESTAURANT_PROFILE = {
  gstNumber: '27AABCJ4821K1Z6',
  address: '14 Linking Road, Bandra West, Mumbai, Maharashtra 400050',
  defaultGstRate: 5,
  maxDiscountPercent: 20,
} as const;

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

export type SectionSeed = {
  name: string;
  description: string;
  isActive?: boolean;
  tables: readonly { tableNumber: string; capacity: number; isActive?: boolean }[];
};

export const DINING_SECTIONS: readonly SectionSeed[] = [
  {
    name: 'Main Hall',
    description: 'Indoor air-conditioned dining',
    tables: [
      { tableNumber: 'T1', capacity: 2 },
      { tableNumber: 'T2', capacity: 4 },
      { tableNumber: 'T3', capacity: 4 },
      { tableNumber: 'T4', capacity: 6 },
      { tableNumber: 'T5', capacity: 4 },
      { tableNumber: 'T6', capacity: 2 },
      { tableNumber: 'T7', capacity: 4 },
      { tableNumber: 'T8', capacity: 8 },
    ],
  },
  {
    name: 'Terrace',
    description: 'Open-air rooftop seating',
    tables: [
      { tableNumber: 'R1', capacity: 2 },
      { tableNumber: 'R2', capacity: 2 },
      { tableNumber: 'R3', capacity: 4 },
      { tableNumber: 'R4', capacity: 4 },
      { tableNumber: 'R5', capacity: 6 },
    ],
  },
  {
    name: 'Bar Lounge',
    description: 'High tables beside the bar counter',
    tables: [
      { tableNumber: 'B1', capacity: 2 },
      { tableNumber: 'B2', capacity: 2 },
      { tableNumber: 'B3', capacity: 4 },
      { tableNumber: 'B4', capacity: 4 },
    ],
  },
  {
    name: 'Private Dining',
    description: 'Bookable rooms for groups and events',
    tables: [
      { tableNumber: 'PD1', capacity: 10 },
      { tableNumber: 'PD2', capacity: 12 },
    ],
  },
  {
    name: 'Garden',
    description: 'Seasonal outdoor seating, closed for the monsoon',
    isActive: false,
    tables: [
      { tableNumber: 'G1', capacity: 4, isActive: false },
      { tableNumber: 'G2', capacity: 6, isActive: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export type SupplierKey = 'produce' | 'dairy' | 'meat' | 'staples' | 'bar';

export type StockSeed = {
  name: string;
  sku: string;
  baseUnit: InventoryBaseUnit;
  /** Reorder threshold in base units. */
  reorderLevel: number;
  /** Opening count in base units. Items opened below `reorderLevel` show as low stock. */
  opening: number;
  /** Opening cost per base unit (INR). */
  unitCost: string;
  supplier: SupplierKey;
};

export const STOCK_ITEMS: readonly StockSeed[] = [
  // Produce
  {
    name: 'Onion',
    sku: 'PRD-001',
    baseUnit: 'G',
    reorderLevel: 5000,
    opening: 18000,
    unitCost: '0.035',
    supplier: 'produce',
  },
  {
    name: 'Tomato',
    sku: 'PRD-002',
    baseUnit: 'G',
    reorderLevel: 4000,
    opening: 12000,
    unitCost: '0.04',
    supplier: 'produce',
  },
  {
    name: 'Potato',
    sku: 'PRD-003',
    baseUnit: 'G',
    reorderLevel: 5000,
    opening: 15000,
    unitCost: '0.03',
    supplier: 'produce',
  },
  {
    name: 'Garlic',
    sku: 'PRD-004',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 2500,
    unitCost: '0.16',
    supplier: 'produce',
  },
  {
    name: 'Ginger',
    sku: 'PRD-005',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 2000,
    unitCost: '0.14',
    supplier: 'produce',
  },
  {
    name: 'Green Chilli',
    sku: 'PRD-006',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 1200,
    unitCost: '0.08',
    supplier: 'produce',
  },
  {
    name: 'Capsicum',
    sku: 'PRD-007',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 3500,
    unitCost: '0.09',
    supplier: 'produce',
  },
  {
    name: 'Mushroom',
    sku: 'PRD-008',
    baseUnit: 'G',
    reorderLevel: 1500,
    opening: 1000,
    unitCost: '0.24',
    supplier: 'produce',
  },
  {
    name: 'Spinach',
    sku: 'PRD-009',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 3000,
    unitCost: '0.06',
    supplier: 'produce',
  },
  {
    name: 'Carrot',
    sku: 'PRD-010',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 4000,
    unitCost: '0.045',
    supplier: 'produce',
  },
  {
    name: 'Cucumber',
    sku: 'PRD-011',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 3500,
    unitCost: '0.04',
    supplier: 'produce',
  },
  {
    name: 'Lettuce',
    sku: 'PRD-012',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 1800,
    unitCost: '0.12',
    supplier: 'produce',
  },
  {
    name: 'Lemon',
    sku: 'PRD-013',
    baseUnit: 'UNIT',
    reorderLevel: 50,
    opening: 120,
    unitCost: '6',
    supplier: 'produce',
  },
  {
    name: 'Coriander Leaves',
    sku: 'PRD-014',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 800,
    unitCost: '0.1',
    supplier: 'produce',
  },
  {
    name: 'Basil',
    sku: 'PRD-015',
    baseUnit: 'G',
    reorderLevel: 200,
    opening: 150,
    unitCost: '0.6',
    supplier: 'produce',
  },
  {
    name: 'Mint Leaves',
    sku: 'PRD-016',
    baseUnit: 'G',
    reorderLevel: 300,
    opening: 600,
    unitCost: '0.12',
    supplier: 'produce',
  },
  // Dairy & eggs
  {
    name: 'Milk',
    sku: 'DRY-001',
    baseUnit: 'ML',
    reorderLevel: 10000,
    opening: 24000,
    unitCost: '0.058',
    supplier: 'dairy',
  },
  {
    name: 'Butter',
    sku: 'DRY-002',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 4000,
    unitCost: '0.52',
    supplier: 'dairy',
  },
  {
    name: 'Cream',
    sku: 'DRY-003',
    baseUnit: 'ML',
    reorderLevel: 2000,
    opening: 3000,
    unitCost: '0.22',
    supplier: 'dairy',
  },
  {
    name: 'Cheese',
    sku: 'DRY-004',
    baseUnit: 'G',
    reorderLevel: 1500,
    opening: 2500,
    unitCost: '0.48',
    supplier: 'dairy',
  },
  {
    name: 'Mozzarella Cheese',
    sku: 'DRY-005',
    baseUnit: 'G',
    reorderLevel: 3000,
    opening: 2200,
    unitCost: '0.56',
    supplier: 'dairy',
  },
  {
    name: 'Paneer',
    sku: 'DRY-006',
    baseUnit: 'G',
    reorderLevel: 3000,
    opening: 6000,
    unitCost: '0.38',
    supplier: 'dairy',
  },
  {
    name: 'Yogurt',
    sku: 'DRY-007',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 5000,
    unitCost: '0.09',
    supplier: 'dairy',
  },
  {
    name: 'Egg',
    sku: 'DRY-008',
    baseUnit: 'UNIT',
    reorderLevel: 60,
    opening: 180,
    unitCost: '7',
    supplier: 'dairy',
  },
  {
    name: 'Vanilla Ice Cream',
    sku: 'DRY-009',
    baseUnit: 'ML',
    reorderLevel: 3000,
    opening: 6000,
    unitCost: '0.25',
    supplier: 'dairy',
  },
  // Meat & seafood
  {
    name: 'Chicken',
    sku: 'MTS-001',
    baseUnit: 'G',
    reorderLevel: 8000,
    opening: 15000,
    unitCost: '0.26',
    supplier: 'meat',
  },
  {
    name: 'Mutton',
    sku: 'MTS-002',
    baseUnit: 'G',
    reorderLevel: 4000,
    opening: 6000,
    unitCost: '0.72',
    supplier: 'meat',
  },
  {
    name: 'Fish',
    sku: 'MTS-003',
    baseUnit: 'G',
    reorderLevel: 3000,
    opening: 4000,
    unitCost: '0.55',
    supplier: 'meat',
  },
  {
    name: 'Prawns',
    sku: 'MTS-004',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 1200,
    unitCost: '0.85',
    supplier: 'meat',
  },
  // Dry goods & staples
  {
    name: 'Rice',
    sku: 'STP-001',
    baseUnit: 'G',
    reorderLevel: 10000,
    opening: 25000,
    unitCost: '0.09',
    supplier: 'staples',
  },
  {
    name: 'Wheat Flour',
    sku: 'STP-002',
    baseUnit: 'G',
    reorderLevel: 10000,
    opening: 20000,
    unitCost: '0.04',
    supplier: 'staples',
  },
  {
    name: 'Refined Flour',
    sku: 'STP-003',
    baseUnit: 'G',
    reorderLevel: 5000,
    opening: 10000,
    unitCost: '0.045',
    supplier: 'staples',
  },
  {
    name: 'Pizza Dough',
    sku: 'STP-004',
    baseUnit: 'UNIT',
    reorderLevel: 20,
    opening: 40,
    unitCost: '35',
    supplier: 'staples',
  },
  {
    name: 'Pasta',
    sku: 'STP-005',
    baseUnit: 'G',
    reorderLevel: 3000,
    opening: 6000,
    unitCost: '0.18',
    supplier: 'staples',
  },
  {
    name: 'Bread',
    sku: 'STP-006',
    baseUnit: 'UNIT',
    reorderLevel: 10,
    opening: 20,
    unitCost: '45',
    supplier: 'staples',
  },
  {
    name: 'Sugar',
    sku: 'STP-007',
    baseUnit: 'G',
    reorderLevel: 5000,
    opening: 12000,
    unitCost: '0.045',
    supplier: 'staples',
  },
  {
    name: 'Salt',
    sku: 'STP-008',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 5000,
    unitCost: '0.02',
    supplier: 'staples',
  },
  {
    name: 'Black Pepper',
    sku: 'STP-009',
    baseUnit: 'G',
    reorderLevel: 300,
    opening: 800,
    unitCost: '0.9',
    supplier: 'staples',
  },
  {
    name: 'Red Chilli Powder',
    sku: 'STP-010',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 1500,
    unitCost: '0.35',
    supplier: 'staples',
  },
  {
    name: 'Turmeric Powder',
    sku: 'STP-011',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 1200,
    unitCost: '0.28',
    supplier: 'staples',
  },
  {
    name: 'Cumin Seeds',
    sku: 'STP-012',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 1000,
    unitCost: '0.4',
    supplier: 'staples',
  },
  {
    name: 'Garam Masala',
    sku: 'STP-013',
    baseUnit: 'G',
    reorderLevel: 300,
    opening: 700,
    unitCost: '0.8',
    supplier: 'staples',
  },
  {
    name: 'Black Lentils',
    sku: 'STP-014',
    baseUnit: 'G',
    reorderLevel: 3000,
    opening: 8000,
    unitCost: '0.13',
    supplier: 'staples',
  },
  {
    name: 'Kidney Beans',
    sku: 'STP-015',
    baseUnit: 'G',
    reorderLevel: 2000,
    opening: 4000,
    unitCost: '0.15',
    supplier: 'staples',
  },
  {
    name: 'Cashew Nuts',
    sku: 'STP-016',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 2000,
    unitCost: '0.95',
    supplier: 'staples',
  },
  {
    name: 'Kasuri Methi',
    sku: 'STP-017',
    baseUnit: 'G',
    reorderLevel: 100,
    opening: 300,
    unitCost: '1.2',
    supplier: 'staples',
  },
  {
    name: 'Coffee Beans',
    sku: 'STP-018',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 2500,
    unitCost: '1.4',
    supplier: 'staples',
  },
  {
    name: 'Tea Leaves',
    sku: 'STP-019',
    baseUnit: 'G',
    reorderLevel: 500,
    opening: 1500,
    unitCost: '0.6',
    supplier: 'staples',
  },
  {
    name: 'Dark Chocolate',
    sku: 'STP-020',
    baseUnit: 'G',
    reorderLevel: 1000,
    opening: 2000,
    unitCost: '0.7',
    supplier: 'staples',
  },
  // Oils, sauces & liquids
  {
    name: 'Cooking Oil',
    sku: 'OIL-001',
    baseUnit: 'ML',
    reorderLevel: 10000,
    opening: 20000,
    unitCost: '0.14',
    supplier: 'staples',
  },
  {
    name: 'Olive Oil',
    sku: 'OIL-002',
    baseUnit: 'ML',
    reorderLevel: 2000,
    opening: 3000,
    unitCost: '0.75',
    supplier: 'staples',
  },
  {
    name: 'Tomato Sauce',
    sku: 'OIL-003',
    baseUnit: 'ML',
    reorderLevel: 2000,
    opening: 4000,
    unitCost: '0.12',
    supplier: 'staples',
  },
  {
    name: 'Soy Sauce',
    sku: 'OIL-004',
    baseUnit: 'ML',
    reorderLevel: 1000,
    opening: 2000,
    unitCost: '0.15',
    supplier: 'staples',
  },
  {
    name: 'Vinegar',
    sku: 'OIL-005',
    baseUnit: 'ML',
    reorderLevel: 1000,
    opening: 2000,
    unitCost: '0.06',
    supplier: 'staples',
  },
  // Bar
  {
    name: 'Water',
    sku: 'BAR-001',
    baseUnit: 'UNIT',
    reorderLevel: 48,
    opening: 120,
    unitCost: '12',
    supplier: 'bar',
  },
  {
    name: 'Vodka',
    sku: 'BAR-002',
    baseUnit: 'ML',
    reorderLevel: 3000,
    opening: 7500,
    unitCost: '1.6',
    supplier: 'bar',
  },
  {
    name: 'Rum',
    sku: 'BAR-003',
    baseUnit: 'ML',
    reorderLevel: 3000,
    opening: 6000,
    unitCost: '1.1',
    supplier: 'bar',
  },
  {
    name: 'Whisky',
    sku: 'BAR-004',
    baseUnit: 'ML',
    reorderLevel: 4000,
    opening: 9000,
    unitCost: '2.6',
    supplier: 'bar',
  },
  {
    name: 'Gin',
    sku: 'BAR-005',
    baseUnit: 'ML',
    reorderLevel: 3000,
    opening: 2250,
    unitCost: '2.2',
    supplier: 'bar',
  },
  {
    name: 'Triple Sec',
    sku: 'BAR-006',
    baseUnit: 'ML',
    reorderLevel: 750,
    opening: 1500,
    unitCost: '1.5',
    supplier: 'bar',
  },
  {
    name: 'Beer',
    sku: 'BAR-007',
    baseUnit: 'UNIT',
    reorderLevel: 48,
    opening: 96,
    unitCost: '95',
    supplier: 'bar',
  },
  {
    name: 'Wine',
    sku: 'BAR-008',
    baseUnit: 'ML',
    reorderLevel: 4500,
    opening: 9000,
    unitCost: '1.2',
    supplier: 'bar',
  },
  {
    name: 'Soda',
    sku: 'BAR-009',
    baseUnit: 'UNIT',
    reorderLevel: 48,
    opening: 120,
    unitCost: '20',
    supplier: 'bar',
  },
  {
    name: 'Cola',
    sku: 'BAR-010',
    baseUnit: 'UNIT',
    reorderLevel: 48,
    opening: 96,
    unitCost: '25',
    supplier: 'bar',
  },
  {
    name: 'Tonic Water',
    sku: 'BAR-011',
    baseUnit: 'UNIT',
    reorderLevel: 24,
    opening: 48,
    unitCost: '45',
    supplier: 'bar',
  },
  {
    name: 'Orange Juice',
    sku: 'BAR-012',
    baseUnit: 'ML',
    reorderLevel: 3000,
    opening: 6000,
    unitCost: '0.12',
    supplier: 'bar',
  },
  {
    name: 'Ice',
    sku: 'BAR-013',
    baseUnit: 'G',
    reorderLevel: 10000,
    opening: 20000,
    unitCost: '0.008',
    supplier: 'bar',
  },
];

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const SUPPLIERS: readonly {
  key: SupplierKey | 'archived';
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  isActive?: boolean;
}[] = [
  {
    key: 'produce',
    name: 'Green Valley Farms',
    contactName: 'Ramesh Patil',
    email: 'orders@greenvalleyfarms.example',
    phone: '+91 98200 11223',
    address: 'Shop 42, APMC Market, Vashi, Navi Mumbai 400703',
  },
  {
    key: 'dairy',
    name: 'Shree Krishna Dairy',
    contactName: 'Anita Deshmukh',
    email: 'sales@shreekrishnadairy.example',
    phone: '+91 98201 33445',
    address: 'Plot 7, MIDC Andheri East, Mumbai 400093',
  },
  {
    key: 'meat',
    name: 'Coastal Catch Meats & Seafood',
    contactName: 'Joseph Fernandes',
    email: 'supply@coastalcatch.example',
    phone: '+91 98202 55667',
    address: 'Sassoon Dock, Colaba, Mumbai 400005',
  },
  {
    key: 'staples',
    name: 'Metro Staples Wholesale',
    contactName: 'Vikram Shah',
    email: 'accounts@metrostaples.example',
    phone: '+91 98203 77889',
    address: '18 Masjid Bunder Road, Mumbai 400009',
  },
  {
    key: 'bar',
    name: 'Spirit Line Beverages',
    contactName: 'Neha Kapoor',
    email: 'orders@spiritline.example',
    phone: '+91 98204 99001',
    address: 'Unit 3, Bhiwandi Logistics Park, Thane 421302',
  },
  {
    key: 'archived',
    name: 'Heritage Spice Traders',
    contactName: 'Mohan Iyer',
    email: 'mohan@heritagespice.example',
    phone: '+91 98205 12121',
    address: 'Crawford Market, Mumbai 400001',
    isActive: false,
  },
];

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export type RecipeLine = readonly [stockItem: string, quantity: string, unit: Unit];

export type MenuItemSeed = {
  name: string;
  description: string;
  price: string;
  recipe: readonly RecipeLine[];
  isAvailable?: boolean;
  isActive?: boolean;
  /** Relative popularity when generating order history (default 1). */
  weight?: number;
};

export type MenuCategorySeed = {
  name: string;
  type: ServingType;
  items: readonly MenuItemSeed[];
};

export const MENU: readonly MenuCategorySeed[] = [
  {
    name: 'Starters',
    type: 'FOOD',
    items: [
      {
        name: 'Paneer Tikka',
        description: 'Chargrilled cottage cheese marinated in spiced yogurt',
        price: '320',
        weight: 3,
        recipe: [
          ['Paneer', '200', 'G'],
          ['Yogurt', '50', 'G'],
          ['Capsicum', '50', 'G'],
          ['Onion', '50', 'G'],
          ['Garam Masala', '5', 'G'],
          ['Red Chilli Powder', '3', 'G'],
        ],
      },
      {
        name: 'Chicken Tikka',
        description: 'Boneless chicken from the tandoor, mint chutney',
        price: '380',
        weight: 3,
        recipe: [
          ['Chicken', '250', 'G'],
          ['Yogurt', '60', 'G'],
          ['Ginger', '10', 'G'],
          ['Garlic', '10', 'G'],
          ['Garam Masala', '5', 'G'],
          ['Lemon', '1', 'UNIT'],
        ],
      },
      {
        name: 'Hara Bhara Kebab',
        description: 'Spinach and potato patties, shallow fried',
        price: '260',
        recipe: [
          ['Spinach', '120', 'G'],
          ['Potato', '100', 'G'],
          ['Green Chilli', '5', 'G'],
          ['Cooking Oil', '30', 'ML'],
        ],
      },
      {
        name: 'Crispy Prawns',
        description: 'Batter-fried prawns with garlic aioli',
        price: '520',
        recipe: [
          ['Prawns', '200', 'G'],
          ['Refined Flour', '40', 'G'],
          ['Garlic', '10', 'G'],
          ['Egg', '1', 'UNIT'],
          ['Cooking Oil', '60', 'ML'],
        ],
      },
      {
        name: 'Mushroom Garlic Toast',
        description: 'Sautéed mushrooms on buttered sourdough',
        price: '240',
        recipe: [
          ['Mushroom', '100', 'G'],
          ['Bread', '0.5', 'UNIT'],
          ['Butter', '20', 'G'],
          ['Garlic', '10', 'G'],
          ['Cheese', '30', 'G'],
        ],
      },
    ],
  },
  {
    name: 'Soups & Salads',
    type: 'FOOD',
    items: [
      {
        name: 'Tomato Basil Soup',
        description: 'Roasted tomato soup with fresh basil',
        price: '180',
        recipe: [
          ['Tomato', '250', 'G'],
          ['Basil', '5', 'G'],
          ['Cream', '30', 'ML'],
          ['Butter', '10', 'G'],
        ],
      },
      {
        name: 'Caesar Salad',
        description: 'Romaine, parmesan, croutons, classic dressing',
        price: '280',
        recipe: [
          ['Lettuce', '150', 'G'],
          ['Cheese', '30', 'G'],
          ['Olive Oil', '15', 'ML'],
          ['Egg', '1', 'UNIT'],
          ['Bread', '0.25', 'UNIT'],
        ],
      },
      {
        name: 'Greek Salad',
        description: 'Cucumber, tomato, onion, feta and olive oil',
        price: '260',
        recipe: [
          ['Cucumber', '100', 'G'],
          ['Tomato', '100', 'G'],
          ['Onion', '40', 'G'],
          ['Cheese', '40', 'G'],
          ['Olive Oil', '15', 'ML'],
        ],
      },
    ],
  },
  {
    name: 'Main Course',
    type: 'FOOD',
    items: [
      {
        name: 'Butter Chicken',
        description: 'Tandoori chicken in a rich tomato-butter gravy',
        price: '420',
        weight: 4,
        recipe: [
          ['Chicken', '250', 'G'],
          ['Butter', '30', 'G'],
          ['Cream', '50', 'ML'],
          ['Tomato', '150', 'G'],
          ['Cashew Nuts', '20', 'G'],
          ['Kasuri Methi', '2', 'G'],
        ],
      },
      {
        name: 'Daal Makhni',
        description: 'Black lentils slow-cooked overnight with butter',
        price: '180',
        weight: 3,
        recipe: [
          ['Black Lentils', '120', 'G'],
          ['Kidney Beans', '30', 'G'],
          ['Butter', '30', 'G'],
          ['Cream', '30', 'ML'],
          ['Tomato', '80', 'G'],
        ],
      },
      {
        name: 'Karahi Paneer',
        description: 'Paneer tossed with peppers in a karahi masala',
        price: '230',
        weight: 2,
        recipe: [
          ['Paneer', '200', 'G'],
          ['Capsicum', '80', 'G'],
          ['Onion', '80', 'G'],
          ['Tomato', '100', 'G'],
          ['Cooking Oil', '30', 'ML'],
        ],
      },
      {
        name: 'Palak Paneer',
        description: 'Cottage cheese in a creamy spinach gravy',
        price: '320',
        weight: 2,
        recipe: [
          ['Spinach', '200', 'G'],
          ['Paneer', '150', 'G'],
          ['Cream', '20', 'ML'],
          ['Garlic', '10', 'G'],
        ],
      },
      {
        name: 'Mutton Rogan Josh',
        description: 'Kashmiri-style slow-braised mutton curry',
        price: '520',
        recipe: [
          ['Mutton', '250', 'G'],
          ['Yogurt', '80', 'G'],
          ['Onion', '100', 'G'],
          ['Red Chilli Powder', '6', 'G'],
          ['Cooking Oil', '40', 'ML'],
        ],
      },
      {
        name: 'Goan Fish Curry',
        description: 'Kingfish in a tangy coconut-tomato curry',
        price: '460',
        recipe: [
          ['Fish', '220', 'G'],
          ['Tomato', '100', 'G'],
          ['Onion', '80', 'G'],
          ['Turmeric Powder', '4', 'G'],
          ['Cooking Oil', '30', 'ML'],
        ],
      },
      {
        name: 'Chicken Biryani',
        description: 'Dum-cooked basmati with chicken, raita on the side',
        price: '380',
        weight: 3,
        recipe: [
          ['Rice', '180', 'G'],
          ['Chicken', '200', 'G'],
          ['Yogurt', '50', 'G'],
          ['Onion', '80', 'G'],
          ['Garam Masala', '6', 'G'],
          ['Mint Leaves', '5', 'G'],
        ],
      },
      {
        name: 'Veg Dum Biryani',
        description: 'Basmati layered with seasonal vegetables',
        price: '300',
        recipe: [
          ['Rice', '180', 'G'],
          ['Carrot', '60', 'G'],
          ['Potato', '60', 'G'],
          ['Yogurt', '40', 'G'],
          ['Garam Masala', '5', 'G'],
        ],
      },
    ],
  },
  {
    name: 'Breads & Rice',
    type: 'FOOD',
    items: [
      {
        name: 'Butter Naan',
        description: 'Leavened bread brushed with butter',
        price: '70',
        weight: 5,
        recipe: [
          ['Refined Flour', '100', 'G'],
          ['Butter', '10', 'G'],
          ['Yogurt', '15', 'G'],
        ],
      },
      {
        name: 'Garlic Naan',
        description: 'Naan topped with garlic and coriander',
        price: '90',
        weight: 4,
        recipe: [
          ['Refined Flour', '100', 'G'],
          ['Garlic', '8', 'G'],
          ['Butter', '10', 'G'],
          ['Coriander Leaves', '3', 'G'],
        ],
      },
      {
        name: 'Tandoori Roti',
        description: 'Whole-wheat bread from the clay oven',
        price: '40',
        weight: 3,
        recipe: [['Wheat Flour', '80', 'G']],
      },
      {
        name: 'Jeera Rice',
        description: 'Basmati tempered with cumin',
        price: '180',
        weight: 2,
        recipe: [
          ['Rice', '150', 'G'],
          ['Cumin Seeds', '4', 'G'],
          ['Butter', '10', 'G'],
        ],
      },
      {
        name: 'Steamed Rice',
        description: 'Plain long-grain basmati',
        price: '140',
        recipe: [['Rice', '150', 'G']],
      },
    ],
  },
  {
    name: 'Pizza & Pasta',
    type: 'FOOD',
    items: [
      {
        name: 'Margherita Pizza',
        description: 'San Marzano tomato, mozzarella, basil',
        price: '380',
        weight: 2,
        recipe: [
          ['Pizza Dough', '1', 'UNIT'],
          ['Mozzarella Cheese', '150', 'G'],
          ['Tomato Sauce', '80', 'ML'],
          ['Basil', '4', 'G'],
          ['Olive Oil', '10', 'ML'],
        ],
      },
      {
        name: 'Farmhouse Pizza',
        description: 'Peppers, onion, mushroom and mozzarella',
        price: '440',
        recipe: [
          ['Pizza Dough', '1', 'UNIT'],
          ['Mozzarella Cheese', '150', 'G'],
          ['Capsicum', '50', 'G'],
          ['Onion', '40', 'G'],
          ['Mushroom', '50', 'G'],
          ['Tomato Sauce', '80', 'ML'],
        ],
      },
      {
        name: 'Penne Arrabbiata',
        description: 'Penne in a spicy garlic-tomato sauce',
        price: '360',
        recipe: [
          ['Pasta', '140', 'G'],
          ['Tomato', '150', 'G'],
          ['Garlic', '10', 'G'],
          ['Olive Oil', '15', 'ML'],
          ['Red Chilli Powder', '2', 'G'],
        ],
      },
      {
        name: 'Fettuccine Alfredo',
        description: 'Fettuccine in parmesan cream sauce',
        price: '390',
        recipe: [
          ['Pasta', '140', 'G'],
          ['Cream', '120', 'ML'],
          ['Butter', '20', 'G'],
          ['Cheese', '30', 'G'],
          ['Black Pepper', '2', 'G'],
        ],
      },
    ],
  },
  {
    name: 'Desserts',
    type: 'FOOD',
    items: [
      {
        name: 'Gulab Jamun',
        description: 'Milk dumplings in cardamom syrup',
        price: '150',
        weight: 2,
        recipe: [
          ['Milk', '150', 'ML'],
          ['Sugar', '60', 'G'],
          ['Refined Flour', '20', 'G'],
          ['Cooking Oil', '40', 'ML'],
        ],
      },
      {
        name: 'Brownie with Ice Cream',
        description: 'Warm chocolate brownie, vanilla scoop',
        price: '260',
        weight: 2,
        recipe: [
          ['Dark Chocolate', '60', 'G'],
          ['Butter', '40', 'G'],
          ['Sugar', '40', 'G'],
          ['Egg', '1', 'UNIT'],
          ['Refined Flour', '30', 'G'],
          ['Vanilla Ice Cream', '80', 'ML'],
        ],
      },
      {
        name: 'Malai Kulfi',
        description: 'Slow-reduced milk ice cream with pistachio',
        price: '160',
        isAvailable: false,
        recipe: [
          ['Milk', '200', 'ML'],
          ['Sugar', '40', 'G'],
          ['Cashew Nuts', '10', 'G'],
        ],
      },
      {
        name: 'Mango Cheesecake',
        description: 'Seasonal: Alphonso mango cheesecake',
        price: '340',
        isActive: false,
        recipe: [
          ['Cheese', '120', 'G'],
          ['Sugar', '40', 'G'],
          ['Butter', '30', 'G'],
        ],
      },
    ],
  },
  {
    name: 'Beverages',
    type: 'BAR',
    items: [
      {
        name: 'Masala Chai',
        description: 'Spiced milk tea with ginger',
        price: '80',
        weight: 2,
        recipe: [
          ['Milk', '120', 'ML'],
          ['Tea Leaves', '5', 'G'],
          ['Sugar', '10', 'G'],
          ['Ginger', '5', 'G'],
        ],
      },
      {
        name: 'Cappuccino',
        description: 'Double shot with steamed milk',
        price: '160',
        recipe: [
          ['Coffee Beans', '18', 'G'],
          ['Milk', '150', 'ML'],
        ],
      },
      {
        name: 'Cold Coffee',
        description: 'Blended iced coffee with ice cream',
        price: '190',
        recipe: [
          ['Coffee Beans', '18', 'G'],
          ['Milk', '200', 'ML'],
          ['Sugar', '20', 'G'],
          ['Vanilla Ice Cream', '60', 'ML'],
          ['Ice', '100', 'G'],
        ],
      },
      {
        name: 'Fresh Lime Soda',
        description: 'Sweet, salted or mixed',
        price: '120',
        weight: 3,
        recipe: [
          ['Lemon', '1', 'UNIT'],
          ['Soda', '1', 'UNIT'],
          ['Sugar', '15', 'G'],
          ['Ice', '100', 'G'],
        ],
      },
      {
        name: 'Virgin Mojito',
        description: 'Mint, lime and soda',
        price: '180',
        weight: 2,
        recipe: [
          ['Lemon', '1', 'UNIT'],
          ['Mint Leaves', '8', 'G'],
          ['Soda', '1', 'UNIT'],
          ['Sugar', '15', 'G'],
          ['Ice', '120', 'G'],
        ],
      },
      {
        name: 'Mineral Water',
        description: '1 litre bottle',
        price: '40',
        weight: 3,
        recipe: [['Water', '1', 'UNIT']],
      },
      { name: 'Cola', description: '300 ml can', price: '70', recipe: [['Cola', '1', 'UNIT']] },
    ],
  },
  {
    name: 'Cocktails',
    type: 'BAR',
    items: [
      {
        name: 'Classic Mojito',
        description: 'White rum, mint, lime, soda',
        price: '420',
        weight: 2,
        recipe: [
          ['Rum', '60', 'ML'],
          ['Lemon', '1', 'UNIT'],
          ['Mint Leaves', '8', 'G'],
          ['Soda', '1', 'UNIT'],
          ['Sugar', '15', 'G'],
          ['Ice', '120', 'G'],
        ],
      },
      {
        name: 'Gin & Tonic',
        description: 'London dry gin, tonic, lime wedge',
        price: '450',
        recipe: [
          ['Gin', '60', 'ML'],
          ['Tonic Water', '1', 'UNIT'],
          ['Lemon', '0.5', 'UNIT'],
          ['Ice', '120', 'G'],
        ],
      },
      {
        name: 'Screwdriver',
        description: 'Vodka and fresh orange juice',
        price: '380',
        recipe: [
          ['Vodka', '60', 'ML'],
          ['Orange Juice', '150', 'ML'],
          ['Ice', '100', 'G'],
        ],
      },
      {
        name: 'Whisky Sour',
        description: 'Whisky, lemon, sugar, egg white',
        price: '480',
        recipe: [
          ['Whisky', '60', 'ML'],
          ['Lemon', '1', 'UNIT'],
          ['Sugar', '15', 'G'],
          ['Egg', '1', 'UNIT'],
          ['Ice', '100', 'G'],
        ],
      },
      {
        name: 'Cuba Libre',
        description: 'Dark rum, cola, lime',
        price: '400',
        recipe: [
          ['Rum', '60', 'ML'],
          ['Cola', '1', 'UNIT'],
          ['Lemon', '0.5', 'UNIT'],
          ['Ice', '100', 'G'],
        ],
      },
      {
        name: 'Long Island Iced Tea',
        description: 'Vodka, rum, gin, triple sec, cola',
        price: '650',
        recipe: [
          ['Vodka', '15', 'ML'],
          ['Rum', '15', 'ML'],
          ['Gin', '15', 'ML'],
          ['Triple Sec', '15', 'ML'],
          ['Cola', '1', 'UNIT'],
          ['Lemon', '1', 'UNIT'],
        ],
      },
    ],
  },
  {
    name: 'Beer & Wine',
    type: 'BAR',
    items: [
      {
        name: 'Premium Lager (650 ml)',
        description: 'Chilled pint bottle',
        price: '320',
        weight: 3,
        recipe: [['Beer', '1', 'UNIT']],
      },
      {
        name: 'House Red (Glass)',
        description: '150 ml pour',
        price: '450',
        recipe: [['Wine', '150', 'ML']],
      },
      {
        name: 'House Red (Bottle)',
        description: '750 ml bottle',
        price: '2200',
        recipe: [['Wine', '750', 'ML']],
      },
    ],
  },
  {
    name: 'Spirits',
    type: 'BAR',
    items: [
      {
        name: 'Whisky (60 ml)',
        description: 'Blended Scotch, neat or on the rocks',
        price: '420',
        weight: 2,
        recipe: [['Whisky', '60', 'ML']],
      },
      {
        name: 'Vodka (60 ml)',
        description: 'Premium vodka',
        price: '320',
        recipe: [['Vodka', '60', 'ML']],
      },
      {
        name: 'Dark Rum (60 ml)',
        description: 'Aged dark rum',
        price: '280',
        recipe: [['Rum', '60', 'ML']],
      },
      {
        name: 'Gin (60 ml)',
        description: 'London dry gin',
        price: '380',
        recipe: [['Gin', '60', 'ML']],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

/** Regular guests. Phone numbers sit in a block reserved for seed data. */
export const GUESTS: readonly string[] = [
  'Aarav Sharma',
  'Ananya Iyer',
  'Rohit Mehta',
  'Priya Nair',
  'Vikram Singh',
  'Sneha Kulkarni',
  'Arjun Reddy',
  'Kavya Menon',
  'Siddharth Rao',
  'Isha Gupta',
  'Rahul Verma',
  'Neha Joshi',
  'Aditya Banerjee',
  'Pooja Desai',
  'Karthik Subramanian',
  'Meera Pillai',
  'Nikhil Agarwal',
  'Shreya Chatterjee',
  'Varun Malhotra',
  'Divya Krishnan',
  'Manish Tiwari',
  'Riya Kapoor',
  'Sameer Khan',
  'Tanvi Bhatt',
  'Harsh Vardhan',
  'Zoya Hussain',
  'Kunal Saxena',
  'Aishwarya Hegde',
  'Dev Patel',
  'Lakshmi Narayan',
  'Farhan Qureshi',
  'Simran Kaur',
  'Omkar Jadhav',
  'Nandini Rao',
  'Yash Thakkar',
  'Gauri Pandit',
];

export const guestPhone = (index: number): string =>
  `+91 90000 ${String(10001 + index).padStart(5, '0')}`;
