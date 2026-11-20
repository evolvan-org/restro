import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  type InventoryPackageSize,
  inventorySupplyMeasures,
  type InventorySupplyUnit,
  isInventoryPackageUnit,
  type Unit,
} from '@rms/api-contract';
import { Prisma, type StockItem } from '@rms/db';

const Decimal = Prisma.Decimal.clone({ precision: 50 });
const MAX_STOCK = new Decimal('999999999.999');
const MAX_STOCK_COST = new Decimal('9999999999.99999999');

type SupplyTerms = {
  unit: InventorySupplyUnit | null;
  packageSize: InventoryPackageSize | null;
};

export function inventorySupplyTerms(line: {
  unit: InventorySupplyUnit | null;
  packageQuantity: Prisma.Decimal | null;
  packageUnit: Unit | null;
  stockItem: Pick<StockItem, 'baseUnit'>;
}): SupplyTerms {
  return {
    unit: line.unit ?? line.stockItem.baseUnit,
    packageSize:
      line.packageQuantity && line.packageUnit
        ? { quantity: line.packageQuantity.toFixed(), unit: line.packageUnit }
        : null,
  };
}

export function resolveInventorySupply(
  baseUnit: StockItem['baseUnit'],
  input: { unit?: InventorySupplyUnit | null; packageSize?: InventoryPackageSize | null },
): {
  unit: InventorySupplyUnit;
  packageQuantity: string | null;
  packageUnit: Unit | null;
  factor: Prisma.Decimal;
} {
  if (!baseUnit) throw new ConflictException('Configure the ingredient base unit first');
  const unit = input.unit ?? baseUnit;
  const packageSize = input.packageSize;
  let standardUnit: Unit;
  if (isInventoryPackageUnit(unit)) {
    if (!packageSize) throw new BadRequestException('Enter the quantity and unit in one package');
    standardUnit = packageSize.unit;
  } else {
    standardUnit = unit;
  }
  const conversion = inventorySupplyMeasures[standardUnit];
  if (conversion.baseUnit !== baseUnit) {
    throw new BadRequestException(
      'The supplier unit must measure the same quantity as the ingredient base unit',
    );
  }

  return {
    unit,
    packageQuantity: packageSize?.quantity ?? null,
    packageUnit: packageSize?.unit ?? null,
    factor: new Decimal(packageSize?.quantity ?? 1).times(conversion.factor),
  };
}

export function inventoryStockQuantity(
  quantity: string | Prisma.Decimal,
  factor: Prisma.Decimal,
): Prisma.Decimal {
  const converted = factor.times(quantity);
  if (converted.gt(MAX_STOCK) || converted.decimalPlaces() > 3) {
    throw new BadRequestException(
      'The converted stock quantity must fit within 9 whole digits and 3 decimal places',
    );
  }
  return converted;
}

export function inventoryStockUnitCost(
  price: string | Prisma.Decimal,
  factor: Prisma.Decimal,
): Prisma.Decimal {
  const cost = new Decimal(price).div(factor);
  if (cost.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).gt(MAX_STOCK_COST)) {
    throw new BadRequestException('The converted stock unit cost exceeds the supported range');
  }
  return cost;
}

export function matchesInventorySupply(
  requested: { unit?: InventorySupplyUnit; packageSize?: InventoryPackageSize },
  order: SupplyTerms,
): boolean {
  if (requested.unit === undefined) return true;
  if (requested.unit !== order.unit) return false;
  if (!requested.packageSize || !order.packageSize) {
    return !requested.packageSize && !order.packageSize;
  }
  return (
    requested.packageSize.unit === order.packageSize.unit &&
    new Decimal(requested.packageSize.quantity).equals(order.packageSize.quantity)
  );
}
