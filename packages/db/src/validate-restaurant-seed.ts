import { PrismaClient } from '@prisma/client';

import { assertSafeSeedTarget } from './seed/support';
import { readCheckpoint } from './seed/year-seed';
import { validateYearSeed } from './seed/year-validation';

async function main() {
  assertSafeSeedTarget();
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const run = await readCheckpoint(tx);
      if (!run?.done) throw new Error('Complete seed:restaurant --months 12 before validating');
      console.table(await validateYearSeed(tx, run.restaurantId, run.anchor));
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
