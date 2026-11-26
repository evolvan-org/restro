/**
 * Front-of-house activity: regular guests, four weeks of completed service
 * (reservations → orders → KOTs → bills → payments) and a live floor for today
 * with tables in every lifecycle state, open tickets on the kitchen/bar boards,
 * a bill awaiting payment and upcoming bookings.
 *
 * Everything is planned in memory first so KOT and invoice numbers can be
 * assigned in chronological order, then written with bulk inserts. The flow
 * follows apps/api: one reservation per order, KOTs grouped by destination,
 * subtotal over ACTIVE items only, GST on the discounted base, and paid
 * orders leave their table NEEDS_CLEANING.
 */
import { randomUUID } from 'node:crypto';

import type {
  KotDestination,
  KotStatus,
  NotificationType,
  PaymentMethod,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { Permission, type Role, roleHasPermission } from '@rms/permissions';

import { BILL_CANCELLATION_REASONS } from '../tenant-defaults';
import { GUESTS, guestPhone } from './catalog';
import type { SeededMenuItem } from './menu';
import {
  addMinutes,
  billNumber,
  Decimal,
  type DecimalValue,
  financialYear,
  kotNumber,
  localTime,
  Random,
  roundMoney,
  type Tx,
} from './support';
import { fixtureId, type HistoryChunk, serviceSlots, YEAR_DAYS } from './year-config';

const HISTORY_DAYS = 28;
const RESERVATION_MINUTES = 90;
const BREADS = new Set(['Butter Naan', 'Garlic Naan', 'Tandoori Roti']);
const CANCELLATION_REASONS = [
  'Guest cancelled: change of plans',
  'Guest cancelled: running late, will rebook',
  'Duplicate booking',
];

export type SeedUser = { id: string; role: Role };
export type SeedTable = {
  id: string;
  tableNumber: string;
  capacity: number;
  /** Free for live seating: active, AVAILABLE and without an active order. */
  free: boolean;
};

type LinePlan = {
  id: string;
  menuItem: SeededMenuItem;
  quantity: number;
  status: 'ACTIVE' | 'CANCELLED';
  note: string | null;
  createdAt: Date;
};
type KotPlan = {
  id: string;
  orderId: string;
  tableNumber: string;
  tableId: string;
  destination: KotDestination;
  status: KotStatus;
  createdAt: Date;
  completedAt: Date | null;
  createdBy: string;
  lines: LinePlan[];
  number?: string;
};
type BillPlan = {
  id: string;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  cancellationReason?: string;
  generatedAt: Date;
  paidAt: Date | null;
  discountPercent: number;
  payment: { method: PaymentMethod; reference: string | null } | null;
  number?: string;
};
type OrderPlan = {
  id: string;
  table: SeedTable;
  reservationId: string;
  captainId: string;
  status: 'OPEN' | 'SUBMITTED' | 'COMPLETED' | 'CANCELLED';
  openedAt: Date;
  completedAt: Date | null;
  lines: LinePlan[];
  kots: KotPlan[];
  bill: BillPlan | null;
};

export type ServiceHistorySummary = {
  guests: number;
  reservations: number;
  orders: number;
  kots: number;
  bills: number;
  live: string[];
  skipped: boolean;
};

export async function seedServiceHistory(
  tx: Tx,
  input: {
    restaurantId: string;
    users: SeedUser[];
    tables: SeedTable[];
    menu: SeededMenuItem[];
    statusIds: ReadonlyMap<string, string>;
    gstRate: DecimalValue;
    maxDiscountPercent: DecimalValue;
    year?: HistoryChunk & { seed: number; now: Date };
  },
): Promise<ServiceHistorySummary> {
  const { restaurantId, users, tables, menu } = input;
  const { year } = input;
  const rng = new Random(year ? year.seed + year.start : 20261119);
  const liveRng = year ? new Random(year.seed ^ 0x907f) : rng;
  const now = year?.now ?? new Date();
  const time = (day: number, hour: number, minute = 0) => localTime(day, hour, minute, now);
  let sequence = 0;
  const id = () =>
    year
      ? fixtureId(
          `${restaurantId}:year:${year.seed}:${now.toISOString()}:${year.start}:${sequence++}`,
        )
      : randomUUID();
  const guestNames = year
    ? [...GUESTS, ...Array.from({ length: 440 }, (_, i) => `Demo Guest ${i + 1}`)]
    : GUESTS;

  const guestIds: string[] = [];
  if (year) {
    const guests = guestNames.map((guestName, index) => ({
      id: fixtureId(`${restaurantId}:year:guest:${index}`),
      restaurantId,
      guestName,
      phoneNumber: guestPhone(index),
      createdAt: time(-YEAR_DAYS - 7 + Math.max(0, Math.floor((index - GUESTS.length) / 2)), 10),
    }));
    if (year.start === -YEAR_DAYS) await tx.guest.createMany({ data: guests });
    guestIds.push(...guests.map((guest) => guest.id));
  } else
    for (const [index, guestName] of GUESTS.entries()) {
      const phoneNumber = guestPhone(index);
      const guest = await tx.guest.upsert({
        where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
        create: {
          restaurantId,
          guestName,
          phoneNumber,
          createdAt: localTime(-HISTORY_DAYS - 7, 10),
        },
        update: {},
        select: { id: true },
      });
      guestIds.push(guest.id);
    }
  const alreadySeeded = year
    ? 0
    : await tx.reservation.count({
        where: { restaurantId, guestId: { in: guestIds } },
      });
  if (alreadySeeded > 0) {
    return {
      guests: guestIds.length,
      reservations: 0,
      orders: 0,
      kots: 0,
      bills: 0,
      live: [],
      skipped: true,
    };
  }

  const byRole = (role: Role): string[] => users.filter((u) => u.role === role).map((u) => u.id);
  const captains = byRole('CAPTAIN');
  const cashier = byRole('RECEPTION')[0] ?? byRole('MANAGER')[0];
  const manager = byRole('MANAGER')[0];
  if (captains.length === 0 || !cashier || !manager) {
    throw new Error('Service history needs at least one captain, a cashier and a manager');
  }

  const food = menu.filter((item) => item.orderable && item.itemType === 'FOOD');
  const bar = menu.filter((item) => item.orderable && item.itemType === 'BAR');
  const weighted = (items: SeededMenuItem[]) =>
    items.flatMap((item) => Array(item.weight).fill(item) as SeededMenuItem[]);
  const foodPool = weighted(food);
  const barPool = weighted(bar);
  const diningTables = tables.filter((table) => table.capacity <= 6);
  const largeTables = tables.filter((table) => table.capacity > 6);

  const reservations: Prisma.ReservationCreateManyInput[] = [];
  const orders: OrderPlan[] = [];

  const pickLines = (partySize: number, at: Date, withBar: boolean): LinePlan[] => {
    const lines: LinePlan[] = [];
    const chosen = new Set<string>();
    const take = (pool: SeededMenuItem[], count: number) => {
      const target = lines.length + count;
      for (let i = 0; i < count * 4 && lines.length < target; i += 1) {
        const item = rng.pick(pool);
        if (chosen.has(item.id)) continue;
        chosen.add(item.id);
        const quantity = BREADS.has(item.name)
          ? rng.int(1, Math.max(2, partySize))
          : rng.int(1, Math.max(1, Math.ceil(partySize / 2)));
        lines.push({
          id: id(),
          menuItem: item,
          quantity,
          status: 'ACTIVE',
          note: null,
          createdAt: at,
        });
      }
    };
    take(foodPool, Math.min(2 + Math.ceil(partySize / 2), 6));
    if (withBar && barPool.length > 0) take(barPool, rng.int(1, Math.min(3, partySize)));
    const first = lines[0];
    if (first && rng.chance(0.15))
      first.note = rng.pick([
        'Less spicy',
        'No onion, no garlic',
        'Extra crispy',
        'Serve together',
      ]);
    return lines;
  };

  /** Turns ordered lines into KOTs, one per destination, mirroring the send-to-kitchen flow. */
  const ticket = (
    order: Pick<OrderPlan, 'id' | 'table' | 'captainId'>,
    lines: LinePlan[],
    at: Date,
    status: (destination: KotDestination) => KotStatus,
  ): KotPlan[] => {
    const groups: [KotDestination, LinePlan[]][] = [
      [
        'KITCHEN',
        lines.filter((line) => line.status === 'ACTIVE' && line.menuItem.itemType === 'FOOD'),
      ],
      ['BAR', lines.filter((line) => line.status === 'ACTIVE' && line.menuItem.itemType === 'BAR')],
    ];
    return groups
      .filter(([, group]) => group.length > 0)
      .map(([destination, group]) => {
        const kotStatus = status(destination);
        return {
          id: id(),
          orderId: order.id,
          tableId: order.table.id,
          tableNumber: order.table.tableNumber,
          destination,
          status: kotStatus,
          createdAt: at,
          completedAt:
            kotStatus === 'COMPLETED'
              ? addMinutes(at, destination === 'BAR' ? rng.int(5, 10) : rng.int(14, 26))
              : null,
          createdBy: order.captainId,
          lines: group,
        };
      });
  };

  const paymentFor = (): BillPlan['payment'] => {
    const method = rng.pick<PaymentMethod>(['UPI', 'UPI', 'UPI', 'CARD', 'CARD', 'CASH']);
    const reference =
      method === 'UPI'
        ? String(rng.int(100000, 999999)) + String(rng.int(100000, 999999))
        : method === 'CARD'
          ? `TXN${rng.int(10000000, 99999999)}`
          : null;
    return { method, reference };
  };

  const availableCaptain = (captainId: string | null, at: Date) => {
    if (!year || !captainId) return captainId;
    const occupied = (id: string) =>
      reservations.some(
        (reservation) =>
          reservation.captainUserId === id &&
          Math.abs(new Date(reservation.reservationAt).getTime() - at.getTime()) <
            RESERVATION_MINUTES * 60_000,
      );
    if (!occupied(captainId)) return captainId;
    return captains.find((id) => !occupied(id)) ?? null;
  };

  const book = (
    table: SeedTable | null,
    guestId: string,
    at: Date,
    partySize: number,
    status: ReservationStatus,
    captainId: string | null,
    extra: Partial<Prisma.ReservationCreateManyInput> = {},
  ): string => {
    const reservationId = id();
    const walkIn = status === 'COMPLETED' || status === 'SEATED' ? rng.chance(0.4) : false;
    const createdAt = walkIn ? addMinutes(at, -1) : addMinutes(at, -rng.int(60, 60 * 72));
    reservations.push({
      id: reservationId,
      restaurantId,
      guestId,
      tableId: table?.id ?? null,
      captainUserId: year && status !== 'COMPLETED' ? availableCaptain(captainId, at) : captainId,
      createdByUserId: walkIn ? (captainId ?? manager) : rng.pick([manager, ...captains]),
      reservationAt: at,
      partySize,
      status,
      notes: walkIn
        ? 'Walk-in'
        : rng.chance(0.25)
          ? rng.pick(['Birthday', 'Window seat please', 'High chair needed', 'Anniversary dinner'])
          : null,
      createdAt: createdAt < now ? createdAt : now,
      updatedAt: at < now ? at : now,
      ...extra,
    });
    return reservationId;
  };

  /** A full completed visit: seated, two possible ordering rounds, billed and paid. */
  const completedVisit = (
    table: SeedTable,
    seatAt: Date,
    partySize: number,
    assigned?: string,
  ): OrderPlan => {
    const captainId = assigned ?? rng.pick(captains);
    const historical = assigned !== undefined;
    const day = Math.floor((seatAt.getTime() - time(-YEAR_DAYS, 0).getTime()) / 86_400_000);
    const guestPool = historical
      ? guestIds.slice(
          0,
          rng.chance(0.55) ? GUESTS.length : GUESTS.length + Math.max(0, day - 3) * 2,
        )
      : guestIds;
    const reservationId = book(
      table,
      rng.pick(guestPool),
      seatAt,
      partySize,
      'COMPLETED',
      captainId,
    );
    const order: OrderPlan = {
      id: id(),
      table,
      reservationId,
      captainId,
      status: 'COMPLETED',
      openedAt: addMinutes(seatAt, 2),
      completedAt: null,
      lines: [],
      kots: [],
      bill: null,
    };
    const firstAt = addMinutes(order.openedAt, rng.int(4, 10));
    const first = pickLines(partySize, firstAt, rng.chance(0.65));
    if (rng.chance(0.06) && first.length > 1) {
      const dropped = first[first.length - 1];
      if (dropped) dropped.status = 'CANCELLED';
    }
    order.lines.push(...first);
    order.kots.push(...ticket(order, first, firstAt, () => 'COMPLETED'));
    if (rng.chance(0.4)) {
      const secondAt = addMinutes(firstAt, historical ? rng.int(18, 24) : rng.int(30, 45));
      const second = pickLines(1, secondAt, rng.chance(0.5)).slice(0, 2);
      const fresh = second.filter(
        (line) => !order.lines.some((l) => l.menuItem.id === line.menuItem.id),
      );
      order.lines.push(...fresh);
      order.kots.push(...ticket(order, fresh, secondAt, () => 'COMPLETED'));
    }
    const lastServed = order.kots.reduce(
      (latest, kot) => Math.max(latest, kot.completedAt?.getTime() ?? 0),
      0,
    );
    const generatedAt = addMinutes(
      new Date(lastServed),
      historical ? rng.int(12, 18) : rng.int(20, 40),
    );
    const paidAt = addMinutes(generatedAt, rng.int(3, 9));
    order.bill = {
      id: id(),
      status: 'PAID',
      generatedAt,
      paidAt,
      discountPercent: rng.chance(0.12) ? Math.min(10, input.maxDiscountPercent.toNumber()) : 0,
      payment: paymentFor(),
    };
    if (historical && rng.chance(0.025)) {
      order.bill.status = 'CANCELLED';
      order.bill.cancellationReason = rng.pick(BILL_CANCELLATION_REASONS).name;
      order.bill.paidAt = null;
      order.bill.payment = null;
      order.status = 'CANCELLED';
    }
    order.completedAt = paidAt;
    return order;
  };

  // --- Four weeks of service ------------------------------------------------
  if (year)
    for (let day = year.start; day <= year.end; day++) {
      const slots = serviceSlots(day, now, rng);
      let previous = -1;
      let available: SeedTable[] = [];
      let assignedCaptains: string[] = [];
      for (const at of slots) {
        if (year.live && at >= addMinutes(now, -240)) continue;
        if (at.getTime() !== previous) {
          previous = at.getTime();
          available = rng.shuffle(tables);
          assignedCaptains = rng.shuffle(captains);
        }
        const partySize = rng.pick([1, 2, 2, 3, 4, 5, 6, 8, 10]);
        const index = available.findIndex((table) => table.capacity >= partySize);
        const captain = assignedCaptains.pop();
        if (!captain || index < 0) continue;
        const table = available.splice(index, 1)[0]!;
        orders.push(completedVisit(table, at, partySize, captain));
      }
      if (slots.length && day < 0 && rng.chance(0.45)) {
        const cancelled = rng.chance(0.5);
        book(
          null,
          rng.pick(guestIds.slice(0, GUESTS.length)),
          time(day, 16),
          rng.int(2, 5),
          cancelled ? 'CANCELLED' : 'NO_SHOW',
          null,
          cancelled ? { cancellationReason: rng.pick(CANCELLATION_REASONS) } : {},
        );
      }
    }
  else
    for (let day = -HISTORY_DAYS; day <= 0; day += 1) {
      const weekday = localTime(day, 12).getUTCDay();
      const weekend = weekday === 0 || weekday === 5 || weekday === 6;
      const services = [
        { start: [12, 15] as const, covers: weekend ? rng.int(4, 6) : rng.int(2, 4) },
        { start: [19, 0] as const, covers: weekend ? rng.int(6, 9) : rng.int(3, 6) },
      ];
      for (const service of services) {
        const available = rng.shuffle(diningTables);
        for (let i = 0; i < service.covers; i += 1) {
          const partySize = rng.pick([1, 2, 2, 2, 3, 4, 4, 5, 6]);
          const index = available.findIndex((table) => table.capacity >= partySize);
          if (index < 0) break;
          const [table] = available.splice(index, 1);
          if (!table) break;
          const seatAt = localTime(day, service.start[0], service.start[1] + rng.int(0, 150));
          const order = completedVisit(table, seatAt, partySize);
          // Today only keeps visits already paid well before now; the live floor is built below.
          if (order.completedAt && order.completedAt.getTime() > now.getTime() - 30 * 60_000) {
            reservations.pop();
            continue;
          }
          orders.push(order);
        }
      }
      if (weekend && largeTables.length > 0 && rng.chance(0.5) && day < 0) {
        orders.push(
          completedVisit(rng.pick(largeTables), localTime(day, 20, rng.int(0, 45)), rng.int(7, 10)),
        );
      }
      if (day < 0 && rng.chance(0.35)) {
        book(
          rng.pick(diningTables),
          rng.pick(guestIds),
          localTime(day, 20, 30),
          rng.int(2, 4),
          'NO_SHOW',
          rng.pick(captains),
        );
      }
      if (day < 0 && rng.chance(0.3)) {
        book(
          rng.pick(diningTables),
          rng.pick(guestIds),
          localTime(day, 13, 30),
          rng.int(2, 6),
          'CANCELLED',
          null,
          {
            cancellationReason: rng.pick(CANCELLATION_REASONS),
          },
        );
      }
    }

  // --- Live floor -----------------------------------------------------------
  const freeTables = liveRng.shuffle(tables.filter((table) => table.free && table.capacity <= 6));
  const claim = (minCapacity: number): SeedTable | undefined => {
    const index = freeTables.findIndex((table) => table.capacity >= minCapacity);
    return index < 0 ? undefined : freeTables.splice(index, 1)[0];
  };
  const live: string[] = [];
  const tableStates: { tableId: string; code: string; at: Date; captainId: string | null }[] = [];
  const upcomingReservationIds: string[] = [];

  if (!year || year.live) {
    const seatLive = (
      table: SeedTable,
      minutesAgo: number,
      partySize: number,
      build: (order: OrderPlan) => void,
    ) => {
      const seatAt = addMinutes(now, -minutesAgo);
      const captainId = rng.pick(captains);
      const order: OrderPlan = {
        id: id(),
        table,
        reservationId: book(table, rng.pick(guestIds), seatAt, partySize, 'SEATED', captainId),
        captainId,
        status: 'SUBMITTED',
        openedAt: addMinutes(seatAt, 1),
        completedAt: null,
        lines: [],
        kots: [],
        bill: null,
      };
      build(order);
      orders.push(order);
      tableStates.push({ tableId: table.id, code: 'OCCUPIED', at: seatAt, captainId });
    };

    const awaitingFood = claim(4);
    if (awaitingFood) {
      seatLive(awaitingFood, 40, 4, (order) => {
        const at = addMinutes(order.openedAt, 6);
        order.lines = pickLines(4, at, true);
        order.kots = ticket(order, order.lines, at, (destination) =>
          destination === 'KITCHEN' ? 'PREPARING' : 'READY',
        );
      });
      live.push(`${awaitingFood.tableNumber}: kitchen preparing, bar ticket ready`);
    }
    const justOrdered = claim(2);
    if (justOrdered) {
      seatLive(justOrdered, 12, 2, (order) => {
        const at = addMinutes(order.openedAt, 5);
        order.lines = pickLines(2, at, true);
        order.kots = ticket(order, order.lines, at, () => 'PENDING');
      });
      live.push(`${justOrdered.tableNumber}: new tickets pending`);
    }
    const awaitingPayment = claim(3);
    if (awaitingPayment) {
      seatLive(awaitingPayment, 85, 3, (order) => {
        const at = addMinutes(order.openedAt, 8);
        order.lines = pickLines(3, at, true);
        order.kots = ticket(order, order.lines, at, () => 'COMPLETED');
        order.bill = {
          id: id(),
          status: 'OPEN',
          generatedAt: addMinutes(now, -4),
          paidAt: null,
          discountPercent: 0,
          payment: null,
        };
      });
      live.push(`${awaitingPayment.tableNumber}: bill open, awaiting payment`);
    }
    const browsing = claim(2);
    if (browsing) {
      seatLive(browsing, 5, 2, (order) => {
        order.status = 'OPEN';
        order.lines = pickLines(2, addMinutes(order.openedAt, 3), false).slice(0, 2);
      });
      live.push(`${browsing.tableNumber}: order open, nothing sent yet`);
    }
    const justPaid = claim(2);
    if (justPaid) {
      const order = completedVisit(justPaid, addMinutes(now, -200), 2);
      // Shift the whole visit so payment lands eight minutes ago.
      const shift = now.getTime() - 8 * 60_000 - (order.completedAt?.getTime() ?? 0);
      const move = (date: Date) => new Date(date.getTime() + shift);
      const reservation = reservations[reservations.length - 1];
      if (reservation) {
        reservation.reservationAt = move(reservation.reservationAt as Date);
        reservation.createdAt = move(reservation.createdAt as Date);
        reservation.updatedAt = move(reservation.updatedAt as Date);
        if (year) {
          const captain = reservation.captainUserId ?? null;
          reservation.captainUserId = null;
          reservation.captainUserId = availableCaptain(captain, reservation.reservationAt as Date);
        }
      }
      order.openedAt = move(order.openedAt);
      order.completedAt = order.completedAt && move(order.completedAt);
      for (const line of order.lines) line.createdAt = move(line.createdAt);
      for (const kot of order.kots) {
        kot.createdAt = move(kot.createdAt);
        kot.completedAt = kot.completedAt && move(kot.completedAt);
      }
      if (order.bill) {
        order.bill.generatedAt = move(order.bill.generatedAt);
        order.bill.paidAt = order.bill.paidAt && move(order.bill.paidAt);
      }
      orders.push(order);
      tableStates.push({
        tableId: justPaid.id,
        code: 'NEEDS_CLEANING',
        at: order.completedAt ?? now,
        captainId: null,
      });
      live.push(`${justPaid.tableNumber}: paid, needs cleaning`);
    }
    const reservedSoon = claim(4);
    if (reservedSoon) {
      const captain = rng.pick(captains);
      upcomingReservationIds.push(
        book(reservedSoon, rng.pick(guestIds), addMinutes(now, 45), 4, 'BOOKED', captain, {
          notes: 'Birthday: bring the cake out with dessert',
        }),
      );
      tableStates.push({
        tableId: reservedSoon.id,
        code: 'RESERVED',
        at: now,
        captainId: year ? captain : null,
      });
      live.push(`${reservedSoon.tableNumber}: reserved in 45 minutes`);
    }

    // Upcoming bookings: later today without a table yet, and the next four days.
    upcomingReservationIds.push(
      book(null, rng.pick(guestIds), addMinutes(now, 180), 5, 'BOOKED', null, {
        notes: 'Prefers terrace',
      }),
    );
    for (let day = 1; day <= 4; day += 1) {
      const slots = rng.shuffle(diningTables).slice(0, rng.int(2, 4));
      for (const [index, table] of slots.entries()) {
        const at = time(day, index % 2 === 0 ? 20 : 13, rng.pick([0, 15, 30, 45]));
        const assigned = rng.chance(0.75) ? table : null;
        upcomingReservationIds.push(
          book(
            assigned,
            rng.pick(guestIds),
            at,
            rng.int(2, Math.max(2, table.capacity)),
            'BOOKED',
            assigned ? rng.pick(captains) : null,
          ),
        );
      }
    }
    if (largeTables[0]) {
      upcomingReservationIds.push(
        book(
          largeTables[0],
          rng.pick(guestIds),
          time(3, 19, 30),
          10,
          'BOOKED',
          rng.pick(captains),
          { notes: 'Corporate dinner, set menu' },
        ),
      );
    }
    if (year) {
      for (const captain of captains) {
        const table = claim(2);
        if (!table) break;
        tableStates.push({ tableId: table.id, code: 'AVAILABLE', at: now, captainId: captain });
        live.push(`${table.tableNumber}: available on captain's board for a walk-in`);
      }
    }
  }

  // --- Numbering (chronological, continuing any existing sequences) ---------
  if (year)
    await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
  const allKots = orders
    .flatMap((order) => order.kots)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const kotRows = await tx.$queryRaw<{ current: bigint }[]>`
    SELECT COALESCE(MAX(SUBSTRING(kot_number FROM 5)::bigint), 0) AS current
    FROM kots WHERE restaurant_id = ${restaurantId}::uuid AND kot_number ~ '^KOT-[0-9]+$'`;
  let nextKot = Number(kotRows[0]?.current ?? 0n);
  for (const kot of allKots) kot.number = kotNumber((nextKot += 1));

  const allBills = orders
    .flatMap((order) => (order.bill ? [order.bill] : []))
    .sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime());
  const billCounters = new Map<number, number>();
  for (const bill of allBills) {
    const year = financialYear(bill.generatedAt);
    if (!billCounters.has(year)) {
      const pattern = `^INV-${year}-[0-9]+$`;
      const rows = await tx.$queryRaw<{ current: string }[]>`
        SELECT COALESCE(MAX(SUBSTRING(bill_number FROM ${`INV-${year}-`.length + 1}::integer)::numeric), 0)::text AS current
        FROM bills WHERE restaurant_id = ${restaurantId}::uuid AND bill_number ~ ${pattern}`;
      billCounters.set(year, Number(rows[0]?.current ?? '0'));
    }
    const next = (billCounters.get(year) ?? 0) + 1;
    billCounters.set(year, next);
    bill.number = billNumber(year, next);
  }

  // --- Write ----------------------------------------------------------------
  const insert = async <T>(data: T[], write: (batch: T[]) => Promise<unknown>) => {
    const size = year ? 1_000 : Math.max(1, data.length);
    for (let i = 0; i < data.length; i += size) await write(data.slice(i, i + size));
  };
  await insert(reservations, (data) => tx.reservation.createMany({ data }));
  await insert(
    orders.map((order) => ({
      id: order.id,
      restaurantId,
      tableId: order.table.id,
      reservationId: order.reservationId,
      createdByUserId: order.captainId,
      status: order.status,
      openedAt: order.openedAt,
      completedAt: order.completedAt,
      createdAt: order.openedAt,
      updatedAt: order.completedAt ?? order.lines.at(-1)?.createdAt ?? order.openedAt,
    })),
    (data) => tx.order.createMany({ data }),
  );
  await insert(
    orders.flatMap((order) =>
      order.lines.map((line) => ({
        id: line.id,
        orderId: order.id,
        menuItemId: line.menuItem.id,
        quantity: line.quantity,
        unitPrice: line.menuItem.price,
        specialInstructions: line.note,
        status: line.status,
        createdAt: line.createdAt,
        updatedAt: line.createdAt,
      })),
    ),
    (data) => tx.orderItem.createMany({ data }),
  );
  await insert(
    allKots.map((kot) => ({
      id: kot.id,
      restaurantId,
      orderId: kot.orderId,
      createdByUserId: kot.createdBy,
      kotNumber: kot.number ?? '',
      destination: kot.destination,
      status: kot.status,
      completedAt: kot.completedAt,
      createdAt: kot.createdAt,
      updatedAt: kot.completedAt ?? kot.createdAt,
    })),
    (data) => tx.kot.createMany({ data }),
  );
  await insert(
    allKots.flatMap((kot) =>
      kot.lines.map((line) => ({
        id: year ? id() : undefined,
        kotId: kot.id,
        orderItemId: line.id,
        quantity: line.quantity,
        status: kot.status,
        createdAt: kot.createdAt,
        updatedAt: kot.completedAt ?? kot.createdAt,
      })),
    ),
    (data) => tx.kotItem.createMany({ data }),
  );

  const bills: Prisma.BillCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  for (const order of orders) {
    const bill = order.bill;
    if (!bill) continue;
    const subtotal = order.lines
      .filter((line) => line.status === 'ACTIVE')
      .reduce(
        (sum, line) => sum.plus(new Decimal(line.menuItem.price).mul(line.quantity)),
        new Decimal(0),
      );
    const discountAmount = roundMoney(subtotal.mul(bill.discountPercent).div(100));
    const base = subtotal.minus(discountAmount);
    const gstAmount = roundMoney(base.mul(input.gstRate).div(100));
    const totalAmount = base.plus(gstAmount);
    bills.push({
      id: bill.id,
      restaurantId,
      orderId: order.id,
      generatedByUserId: cashier,
      billNumber: bill.number ?? '',
      subtotal,
      discountAmount,
      gstRate: input.gstRate,
      gstAmount,
      totalAmount,
      status: bill.status,
      cancellationReason: bill.cancellationReason,
      generatedAt: bill.generatedAt,
      paidAt: bill.paidAt,
      createdAt: bill.generatedAt,
      updatedAt:
        bill.paidAt ?? (bill.status === 'CANCELLED' ? order.completedAt : null) ?? bill.generatedAt,
    });
    if (bill.payment && bill.paidAt) {
      payments.push({
        ...(year ? { id: id() } : {}),
        billId: bill.id,
        recordedByUserId: cashier,
        paymentMethod: bill.payment.method,
        amount: totalAmount,
        status: 'COMPLETED',
        referenceNumber: bill.payment.reference,
        paidAt: bill.paidAt,
        createdAt: bill.paidAt,
      });
    }
  }
  await insert(bills, (data) => tx.bill.createMany({ data }));
  await insert(payments, (data) => tx.payment.createMany({ data }));

  for (const state of tableStates) {
    const statusId = input.statusIds.get(state.code);
    if (!statusId) throw new Error(`Table status ${state.code} was not seeded`);
    await tx.restaurantTable.update({
      where: { id: state.tableId },
      data: {
        currentStatusId: statusId,
        statusChangedAt: state.at,
        captainUserId: state.captainId,
      },
    });
  }

  // --- Notifications for the live floor -------------------------------------
  const recipients = (permission: Permission) =>
    users.filter((user) => roleHasPermission(user.role, permission)).map((user) => user.id);
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const notify = (
    userIds: string[],
    type: NotificationType,
    title: string,
    body: string,
    entity: { kind: 'ORDER' | 'RESERVATION'; id: string; tableId: string | null },
    at: Date,
    read: boolean,
  ) => {
    for (const recipientUserId of userIds) {
      notifications.push({
        ...(year ? { id: id() } : {}),
        restaurantId,
        recipientUserId,
        type,
        title,
        body,
        entity: entity.kind,
        entityId: entity.id,
        tableId: entity.tableId,
        readAt: read ? addMinutes(at, 2) : null,
        createdAt: at,
        updatedAt: read ? addMinutes(at, 2) : at,
      });
    }
  };
  if (year)
    for (const kot of allKots) {
      if (!kot.completedAt || kot.completedAt > addMinutes(now, -30) || !rng.chance(0.12)) continue;
      notify(
        recipients(Permission.KOT_UPDATE_STATUS),
        'KOT_SENT',
        'New order',
        `Ticket ${kot.number} — Table ${kot.tableNumber}`,
        { kind: 'ORDER', id: kot.orderId, tableId: kot.tableId },
        kot.createdAt,
        !rng.chance(0.02),
      );
    }
  for (const kot of allKots.filter((k) => k.status !== 'COMPLETED')) {
    const target = { kind: 'ORDER' as const, id: kot.orderId, tableId: kot.tableId };
    const label = kot.destination === 'KITCHEN' ? 'Kitchen' : 'Bar';
    notify(
      recipients(Permission.KOT_UPDATE_STATUS),
      'KOT_SENT',
      'New order',
      `${label} ticket ${kot.number} — Table ${kot.tableNumber}`,
      target,
      kot.createdAt,
      kot.status !== 'PENDING',
    );
    if (kot.status === 'READY') {
      const captain = orders.find((order) => order.id === kot.orderId)?.captainId;
      if (captain)
        notify(
          [captain],
          'KOT_READY',
          'Order ready',
          `Ticket ${kot.number} — Table ${kot.tableNumber} is ready to serve`,
          target,
          addMinutes(kot.createdAt, 8),
          false,
        );
    }
  }
  for (const id of upcomingReservationIds) {
    const reservation = reservations.find((entry) => entry.id === id);
    if (!reservation) continue;
    const guestName = guestNames[guestIds.indexOf(reservation.guestId)] ?? 'Guest';
    const at = new Date(reservation.reservationAt);
    const createdAt = new Date(reservation.createdAt ?? now);
    notify(
      recipients(Permission.RESERVATION_WRITE).filter(
        (userId) => userId !== reservation.createdByUserId,
      ),
      'RESERVATION_CREATED',
      'New reservation',
      `${guestName} — party of ${reservation.partySize}, ${at.toISOString()}`,
      { kind: 'RESERVATION', id, tableId: reservation.tableId ?? null },
      createdAt,
      createdAt.getTime() < now.getTime() - 24 * 60 * 60_000,
    );
  }
  await insert(notifications, (data) => tx.notification.createMany({ data }));

  return {
    guests: guestIds.length,
    reservations: reservations.length,
    orders: orders.length,
    kots: allKots.length,
    bills: bills.length,
    live,
    skipped: false,
  };
}
