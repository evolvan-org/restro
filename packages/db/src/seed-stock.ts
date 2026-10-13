/**
 * Backfills the baseline ingredient master (`stock_items`) for every restaurant.
 * Idempotent: existing names are left untouched, so it is safe to re-run.
 *
 *   yarn workspace @rms/db seed:stock
 */
import { PrismaClient } from '@prisma/client';

export const BASELINE_STOCK_ITEMS: readonly string[] = [
  // Produce
  'Onion',
  'Tomato',
  'Potato',
  'Garlic',
  'Ginger',
  'Green Chilli',
  'Capsicum',
  'Mushroom',
  'Spinach',
  'Carrot',
  'Cucumber',
  'Lettuce',
  'Lemon',
  'Coriander Leaves',
  'Basil',
  // Dairy & eggs
  'Milk',
  'Butter',
  'Cream',
  'Cheese',
  'Mozzarella Cheese',
  'Paneer',
  'Yogurt',
  'Egg',
  // Meat & seafood
  'Chicken',
  'Mutton',
  'Fish',
  'Prawns',
  // Dry goods & staples
  'Rice',
  'Wheat Flour',
  'Refined Flour',
  'Pizza Dough',
  'Pasta',
  'Bread',
  'Sugar',
  'Salt',
  'Black Pepper',
  'Red Chilli Powder',
  'Turmeric Powder',
  'Cumin Seeds',
  'Garam Masala',
  // Oils, sauces & liquids
  'Cooking Oil',
  'Olive Oil',
  'Tomato Sauce',
  'Soy Sauce',
  'Vinegar',
  'Water',
  // Bar
  'Vodka',
  'Rum',
  'Whisky',
  'Gin',
  'Beer',
  'Wine',
  'Soda',
  'Cola',
  'Ice',
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true } });
    for (const restaurant of restaurants) {
      const { count } = await prisma.stockItem.createMany({
        data: BASELINE_STOCK_ITEMS.map((name) => ({ restaurantId: restaurant.id, name })),
        skipDuplicates: true,
      });
      console.log(`${restaurant.name}: added ${count} stock item(s)`);
    }
    console.log(`Done. ${restaurants.length} restaurant(s) processed.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
