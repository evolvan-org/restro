import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  QR_DEFAULT_BRAND_COLOR,
  QR_MAX_CART_LINES,
  QR_MAX_LINE_QUANTITY,
  type QrAddCartItemRequest,
  type QrChannelAuthRequest,
  type QrChannelAuthResponse,
  type QrJoinRequest,
  type QrJoinResponse,
  type QrMenuResponse,
  type QrOrderingState,
  type QrRequestPaymentRequest,
  type QrResolveResponse,
  type QrSessionResponse,
  type QrSplitRequest,
  type QrSubmitRoundRequest,
  type QrUpdateCartItemRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { formatRupees, readableBrandColor } from '@rms/shared';

import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import {
  claimedUnits,
  computeTotals,
  itemShareAmount,
  lineSubtotal,
  splitEqually,
  toTotalsDto,
} from './qr-billing';
import { QrEscalationService } from './qr-escalation.service';
import { type GuestIdentity, QrGuestRepository, type QrTableContext } from './qr-guest.repository';
import { QrNotifier } from './qr-notifier.service';
import { escalationDeadline, firstName, initials, isCaptainAvailable } from './qr-status';
import {
  cartLines,
  computeSessionBill,
  guestBill,
  guestRound,
  parseClaimedItems,
} from './qr-views';

/** A closed visit stays readable for its "All paid" screen, then the phone must scan afresh. */
const CLOSED_SESSION_GRACE_MS = 2 * 60 * 60_000;

type GuestContext = { table: QrTableContext; guest: GuestIdentity };

export function hashGuestSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Generic "not working" for unknown or rotated tokens: never reveals whether a tenant exists. */
function invalidQr(): NotFoundException {
  return new NotFoundException('This QR code isn’t working');
}

@Injectable()
export class QrGuestService {
  constructor(
    private readonly repository: QrGuestRepository,
    private readonly notifier: QrNotifier,
    private readonly realtime: QrRealtimePublisher,
    private readonly rateLimit: RateLimitService,
    private readonly escalation: QrEscalationService,
  ) {}

  static state(table: QrTableContext): QrOrderingState {
    if (table.restaurant.status !== 'ACTIVE' || !table.restaurant.qrOrderingEnabled)
      return 'CLOSED';
    if (!table.isActive) return 'TABLE_INACTIVE';
    if (!table.captain || table.captain.status !== 'ACTIVE') return 'NO_CAPTAIN';
    return 'OPEN';
  }

  async resolve(token: string, ip: string): Promise<QrResolveResponse> {
    await this.rateLimit.consume('QR_RESOLVE_MINUTE', `ip:${ip}`, 60, 60_000);
    const table = await this.findTable(token);
    const state = QrGuestService.state(table);
    if (state === 'NO_CAPTAIN') {
      // At most one open alert per table (partial unique index), so repeat scans don't flood.
      const created = await this.repository.openNoCaptainAlert(table.restaurantId, table.id);
      if (created) {
        await this.notifier.noCaptainScan({
          restaurantId: table.restaurantId,
          tableId: table.id,
          tableNumber: table.tableNumber,
        });
        await this.notifier.live(table.restaurantId, [], {
          kind: 'alert.changed',
          tableId: table.id,
        });
      }
    }
    return {
      state,
      restaurant: this.brand(table),
      table: { id: table.id, number: table.tableNumber },
      captainName: state === 'OPEN' && table.captain ? firstName(table.captain.name) : null,
      realtime: this.realtime.publicConfig(),
    };
  }

  async menu(token: string): Promise<QrMenuResponse> {
    const table = await this.findTable(token);
    const categories = await this.repository.findMenu(table.restaurantId);
    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: category.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price.toFixed(2),
          isVeg: item.isVeg,
          available: item.isAvailable,
          servingType: item.itemType,
        })),
      })),
    };
  }

  async join(token: string, input: QrJoinRequest, ip: string): Promise<QrJoinResponse> {
    await this.rateLimit.consume('QR_JOIN_WINDOW', `ip:${ip}:${token}`, 10, 10 * 60_000);
    const table = await this.findTable(token);
    this.requireOpen(table);
    const guestSecret = randomBytes(32).toString('base64url');
    const { guestId, sessionId } = await this.repository.join({
      restaurantId: table.restaurantId,
      tableId: table.id,
      name: input.name,
      phone: input.phone.replace(/[\s-]/g, ''),
      secretHash: hashGuestSecret(guestSecret),
    });
    await this.notifier.live(table.restaurantId, [sessionId], { kind: 'cart.changed' });
    return { guestSecret, guestId, sessionId };
  }

  async session(token: string, secret: string | undefined): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret, { allowClosed: true });
    void this.repository.touchGuest(context.guest.guestId).catch(() => undefined);
    return this.buildSession(context);
  }

  async authorizeChannel(
    token: string,
    secret: string | undefined,
    input: QrChannelAuthRequest,
  ): Promise<QrChannelAuthResponse> {
    const { guest } = await this.authenticate(token, secret, { allowClosed: true });
    return this.realtime.authorize(this.realtime.sessionChannel(guest.sessionId), input);
  }

  async addCartItem(
    token: string,
    secret: string | undefined,
    input: QrAddCartItemRequest,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    this.requireOpen(context.table);
    const { restaurantId, sessionId, guestId } = context.guest;
    const menuItem = await this.repository.findAvailableMenuItem(restaurantId, input.menuItemId);
    if (!menuItem) throw new NotFoundException('This dish is no longer on the menu');
    if (!menuItem.isAvailable) throw new ConflictException('This dish is sold out today');
    const instructions = input.specialInstructions?.trim() || null;

    await this.repository.withLockedSession(restaurantId, sessionId, async (tx, session) => {
      if (session?.status !== 'OPEN') throw new GoneException('This visit has ended');
      const existing = await this.repository.findMergeableCartLine(tx, sessionId, {
        menuItemId: input.menuItemId,
        specialInstructions: instructions,
        guestId,
      });
      if (existing) {
        const quantity = existing.quantity + input.quantity;
        if (quantity > QR_MAX_LINE_QUANTITY) {
          throw new BadRequestException(
            `You can order up to ${QR_MAX_LINE_QUANTITY} of a dish at once`,
          );
        }
        await this.repository.setCartLineQuantity(tx, sessionId, existing.id, quantity);
        return;
      }
      if ((await this.repository.cartLineCount(tx, sessionId)) >= QR_MAX_CART_LINES) {
        throw new BadRequestException('Your order is full. Send it, then add more.');
      }
      await this.repository.addCartLine(tx, {
        sessionId,
        menuItemId: input.menuItemId,
        quantity: input.quantity,
        specialInstructions: instructions,
        guestId,
      });
    });
    await this.notifier.live(restaurantId, [sessionId], { kind: 'cart.changed' });
    return this.buildSession(context);
  }

  async updateCartItem(
    token: string,
    secret: string | undefined,
    lineId: string,
    input: QrUpdateCartItemRequest,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { restaurantId, sessionId } = context.guest;
    await this.repository.withLockedSession(restaurantId, sessionId, async (tx, session) => {
      if (session?.status !== 'OPEN') throw new GoneException('This visit has ended');
      // Anyone at the table can change the shared order before it is sent.
      const changed = await this.repository.setCartLineQuantity(
        tx,
        sessionId,
        lineId,
        input.quantity,
      );
      if (!changed) throw new NotFoundException('That item is no longer in the order');
    });
    await this.notifier.live(restaurantId, [sessionId], { kind: 'cart.changed' });
    return this.buildSession(context);
  }

  async submitRound(
    token: string,
    secret: string | undefined,
    input: QrSubmitRoundRequest,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { table } = context;
    const { restaurantId, sessionId, guestId } = context.guest;
    const now = new Date();

    const result = await this.repository.withLockedSession(
      restaurantId,
      sessionId,
      async (tx, session) => {
        if (session?.status !== 'OPEN') throw new GoneException('This visit has ended');
        // Double-tap safe: the same key returns the round already sent.
        if (await this.repository.findRoundByIdempotencyKey(tx, sessionId, input.idempotencyKey)) {
          return null;
        }
        this.requireOpen(table);
        const captainId = table.captainUserId;
        if (!captainId)
          throw new ConflictException('Ordering isn’t available at this table right now');
        const cart = await this.repository.findCartForSubmit(tx, restaurantId, sessionId);
        if (cart.length === 0) throw new BadRequestException('Your order is empty');
        const unavailable = cart.find(
          (line) => !line.menuItem.isActive || !line.menuItem.isAvailable,
        );
        if (unavailable) {
          throw new ConflictException(
            `${unavailable.menuItem.name} is sold out today. Remove it to send your order.`,
          );
        }
        // Prices always come from the menu now, never from the client.
        const items = cart.map((line) => ({
          menuItemId: line.menuItemId,
          addedByGuestId: line.addedByGuestId,
          quantity: line.quantity,
          unitPrice: line.menuItem.price,
          specialInstructions: line.specialInstructions,
        }));
        const subtotal = lineSubtotal(items);
        const available = isCaptainAvailable(table.captain, now);
        const round = await this.repository.createRound(tx, {
          restaurantId,
          sessionId,
          tableId: table.id,
          ownerCaptainUserId: captainId,
          guestId,
          idempotencyKey: input.idempotencyKey,
          note: input.note?.trim() || null,
          subtotal,
          items,
          submittedAt: now,
          // A logged-out or idle captain escalates straight to managers.
          escalateAt: available
            ? escalationDeadline(now, table.restaurant.qrEscalationMinutes)
            : now,
        });
        return {
          round,
          captainId,
          available,
          itemCount: items.reduce((count, item) => count + item.quantity, 0),
          total: computeTotals({ subtotal, gstRate: table.restaurant.defaultGstRate }).payable,
        };
      },
    );

    if (result) {
      await this.notifier.roundSubmitted({
        restaurantId,
        captainUserId: result.captainId,
        roundId: result.round.id,
        tableId: table.id,
        tableNumber: table.tableNumber,
        roundNumber: result.round.roundNumber,
        itemCount: result.itemCount,
        total: result.total.toFixed(2),
      });
      await this.notifier.live(restaurantId, [sessionId], {
        kind: 'round.submitted',
        tableId: table.id,
        roundId: result.round.id,
      });
      if (!result.available) await this.escalation.sweep(restaurantId);
    }
    return this.buildSession(context);
  }

  /** "Edit order and send again": puts a rejected round's dishes back in the shared cart. */
  async restoreRejectedRound(
    token: string,
    secret: string | undefined,
    roundId: string,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { restaurantId, sessionId } = context.guest;
    await this.repository.withLockedSession(restaurantId, sessionId, async (tx, session) => {
      if (session?.status !== 'OPEN') throw new GoneException('This visit has ended');
      const round = await this.repository.findRejectedRoundItems(
        tx,
        restaurantId,
        sessionId,
        roundId,
      );
      if (!round) throw new NotFoundException('Order not found');
      if (round.status !== 'REJECTED')
        throw new ConflictException('Only a rejected order can be edited');
      for (const item of round.items) {
        const existing = await this.repository.findMergeableCartLine(tx, sessionId, {
          menuItemId: item.menuItemId,
          specialInstructions: item.specialInstructions,
          guestId: item.addedByGuestId,
        });
        if (existing) {
          await this.repository.setCartLineQuantity(
            tx,
            sessionId,
            existing.id,
            Math.min(QR_MAX_LINE_QUANTITY, existing.quantity + item.requestedQuantity),
          );
        } else {
          await this.repository.addCartLine(tx, {
            sessionId,
            menuItemId: item.menuItemId,
            quantity: item.requestedQuantity,
            specialInstructions: item.specialInstructions,
            guestId: item.addedByGuestId,
          });
        }
      }
    });
    await this.notifier.live(restaurantId, [sessionId], { kind: 'cart.changed' });
    return this.buildSession(context);
  }

  async callServer(token: string, secret: string | undefined): Promise<{ ok: true }> {
    const context = await this.authenticate(token, secret);
    await this.rateLimit.consume(
      'QR_GUEST_WRITE_MINUTE',
      `call:${context.guest.guestId}`,
      3,
      60_000,
    );
    await this.notifier.toCaptain({
      restaurantId: context.guest.restaurantId,
      captainUserId: context.table.captainUserId,
      type: 'call',
      sessionId: context.guest.sessionId,
      tableId: context.table.id,
      tableNumber: context.table.tableNumber,
      body: `${context.guest.displayName} at Table ${context.table.tableNumber} asked for their server.`,
    });
    await this.notifier.live(context.guest.restaurantId, [], {
      kind: 'call-server',
      tableId: context.table.id,
    });
    return { ok: true };
  }

  async requestBill(token: string, secret: string | undefined): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { restaurantId, sessionId } = context.guest;
    const session = await this.repository.findSessionView(restaurantId, sessionId);
    if (!session?.order?.items.length) {
      throw new ConflictException('Nothing has been sent to the kitchen yet');
    }
    if (await this.repository.markBillRequested(restaurantId, sessionId)) {
      const bill = computeSessionBill(session, context.table.restaurant.defaultGstRate);
      await this.notifier.toCaptain({
        restaurantId,
        captainUserId: context.table.captainUserId,
        type: 'bill',
        sessionId,
        tableId: context.table.id,
        tableNumber: context.table.tableNumber,
        body: `Total ${formatRupees(bill.totals.payable.toFixed(2))}. Tap to open the bill.`,
      });
      await this.notifier.live(restaurantId, [sessionId], {
        kind: 'bill.requested',
        tableId: context.table.id,
      });
    }
    return this.buildSession(context);
  }

  async split(
    token: string,
    secret: string | undefined,
    input: QrSplitRequest,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { restaurantId, sessionId, guestId, displayName } = context.guest;
    const gstRate = context.table.restaurant.defaultGstRate;

    await this.repository.withLockedSession(restaurantId, sessionId, async (tx, locked) => {
      if (locked?.status !== 'OPEN') throw new GoneException('This visit has ended');
      const session = await this.repository.findSessionView(restaurantId, sessionId);
      if (!session?.order?.items.length) throw new ConflictException('There is no bill yet');
      const bill = computeSessionBill(session, gstRate);
      if (bill.settled) throw new ConflictException('This bill is already paid');
      const anyPaid = session.shares.some((share) => share.status === 'PAID');

      if (input.mode === 'FULL' || input.mode === 'EQUAL') {
        if (anyPaid) {
          throw new ConflictException(
            'Part of the bill is already paid. Pay what’s left as a custom amount.',
          );
        }
        if (input.mode === 'FULL') {
          await this.repository.replaceUnpaidShares(tx, restaurantId, sessionId, 'FULL', [
            { label: displayName, amount: bill.totals.payable, guestId },
          ]);
          return;
        }
        const amounts = splitEqually(bill.totals.payable, input.people);
        await this.repository.replaceUnpaidShares(
          tx,
          restaurantId,
          sessionId,
          'EQUAL',
          amounts.map((amount, index) => {
            const guest = session.guests[index];
            return {
              label: guest?.displayName ?? `Guest ${index + 1}`,
              amount,
              guestId: guest?.id ?? null,
            };
          }),
        );
        return;
      }

      const others = session.shares.filter(
        (share) => share.guestId !== guestId || share.status === 'PAID',
      );
      if (input.mode === 'BY_ITEM') {
        const lines = new Map(session.order.items.map((item) => [item.id, item]));
        const claimed = claimedUnits(
          others.map((share) => ({ claimedItems: parseClaimedItems(share.claimedItems) })),
        );
        let subtotal = new Prisma.Decimal(0);
        for (const item of input.items) {
          const line = lines.get(item.orderItemId);
          if (!line)
            throw new BadRequestException({ message: ['items: That dish isn’t on this bill'] });
          const free = line.quantity - (claimed.get(item.orderItemId) ?? 0);
          if (item.quantity > free) {
            throw new ConflictException(`Someone else already picked ${line.menuItem.name}`);
          }
          subtotal = subtotal.plus(line.unitPrice.mul(item.quantity));
        }
        await this.repository.replaceMyShare(tx, restaurantId, sessionId, guestId, 'BY_ITEM', {
          label: displayName,
          amount: itemShareAmount(subtotal, bill.totals),
          claimedItems: input.items,
        });
        return;
      }

      const amount = new Prisma.Decimal(input.amount);
      if (amount.lte(0)) throw new BadRequestException({ message: ['amount: Enter an amount'] });
      if (amount.gt(bill.remaining)) {
        throw new BadRequestException({
          message: [`amount: Only ${formatRupees(bill.remaining.toFixed(2))} is left to pay`],
        });
      }
      await this.repository.replaceMyShare(tx, restaurantId, sessionId, guestId, 'CUSTOM', {
        label: displayName,
        amount,
        claimedItems: null,
      });
    });
    await this.notifier.live(restaurantId, [sessionId], { kind: 'bill.changed' });
    return this.buildSession(context);
  }

  /**
   * Asks the captain to come and collect this share. The captain brings the restaurant's UPI QR
   * (or takes cash/card) and confirms the payment manually; the guest can never mark it paid.
   */
  async requestPayment(
    token: string,
    secret: string | undefined,
    shareId: string,
    input: QrRequestPaymentRequest,
  ): Promise<QrSessionResponse> {
    const context = await this.authenticate(token, secret);
    await this.consumeWrite(context.guest.guestId);
    const { restaurantId, sessionId, guestId, displayName } = context.guest;
    const amount = await this.repository.withLockedSession(
      restaurantId,
      sessionId,
      async (tx, locked) => {
        if (locked?.status !== 'OPEN') throw new GoneException('This visit has ended');
        const share = await this.repository.findShareForGuest(tx, restaurantId, sessionId, shareId);
        if (!share) throw new NotFoundException('Share not found');
        if (share.status === 'PAID') throw new ConflictException('This share is already paid');
        if (share.guestId && share.guestId !== guestId) {
          throw new ForbiddenException('This share belongs to someone else at the table');
        }
        await this.repository.requestSharePayment(
          tx,
          shareId,
          guestId,
          input.method,
          share.guestId ? null : displayName,
        );
        return share.amount;
      },
    );
    const how = { UPI: 'by UPI', CASH: 'in cash', CARD: 'by card' }[input.method];
    await this.notifier.toCaptain({
      restaurantId,
      captainUserId: context.table.captainUserId,
      type: 'payment',
      sessionId,
      tableId: context.table.id,
      tableNumber: context.table.tableNumber,
      body: `${displayName} wants to pay ${formatRupees(amount.toFixed(2))} ${how}.`,
    });
    await this.notifier.live(restaurantId, [sessionId], { kind: 'bill.changed' });
    return this.buildSession(context);
  }

  // -------------------------------------------------------------------------

  private async findTable(token: string): Promise<QrTableContext> {
    const table = await this.repository.findTableByToken(token);
    if (!table) throw invalidQr();
    return table;
  }

  private brand(table: QrTableContext): QrResolveResponse['restaurant'] {
    return {
      name: table.restaurant.name,
      initials: initials(table.restaurant.name),
      brandColor: readableBrandColor(table.restaurant.brandColor, QR_DEFAULT_BRAND_COLOR),
      guestPhone: table.restaurant.guestPhone,
      currency: table.restaurant.currency,
    };
  }

  private requireOpen(table: QrTableContext): void {
    const state = QrGuestService.state(table);
    if (state === 'OPEN') return;
    const message = {
      CLOSED: 'We’re not taking orders from this table right now',
      TABLE_INACTIVE: 'This table isn’t in use',
      NO_CAPTAIN: 'Ordering isn’t available at this table right now',
    }[state];
    throw new ConflictException(message);
  }

  private async consumeWrite(guestId: string): Promise<void> {
    await this.rateLimit.consume('QR_GUEST_WRITE_MINUTE', `guest:${guestId}`, 60, 60_000);
  }

  private async authenticate(
    token: string,
    secret: string | undefined,
    options: { allowClosed?: boolean } = {},
  ): Promise<GuestContext> {
    if (!secret || secret.length < 32 || secret.length > 100) {
      throw new UnauthorizedException('Enter your name and phone number to continue');
    }
    const [table, guest] = await Promise.all([
      this.findTable(token),
      this.repository.findGuestBySecret(hashGuestSecret(secret)),
    ]);
    // The secret must belong to a phone at THIS table; a rotated token invalidates everything.
    if (!guest || guest.tableId !== table.id || guest.restaurantId !== table.restaurantId) {
      throw new UnauthorizedException('Enter your name and phone number to continue');
    }
    if (guest.sessionStatus === 'CLOSED') {
      const expired =
        !guest.closedAt || Date.now() - guest.closedAt.getTime() > CLOSED_SESSION_GRACE_MS;
      if (!options.allowClosed || expired) throw new GoneException('This visit has ended');
    }
    return { table, guest };
  }

  private async buildSession({ table, guest }: GuestContext): Promise<QrSessionResponse> {
    const session = await this.repository.findSessionView(guest.restaurantId, guest.sessionId);
    if (!session) throw new GoneException('This visit has ended');
    const gstRate = table.restaurant.defaultGstRate;
    const previousIds = session.rounds
      .map((round) => round.reassignedFromUserId)
      .filter((id): id is string => id !== null);
    const previousNames = new Map(
      [...(await this.repository.findUserNames(guest.restaurantId, previousIds))].map(
        ([id, name]) => [id, firstName(name)],
      ),
    );
    const cart = cartLines(session, guest.guestId);
    const state = QrGuestService.state(table);
    return {
      sessionId: session.id,
      status: session.status,
      state,
      me: { id: guest.guestId, name: guest.displayName, isMe: true },
      guests: session.guests.map((g) => ({
        id: g.id,
        name: g.displayName,
        isMe: g.id === guest.guestId,
      })),
      captainName: state === 'OPEN' && table.captain ? firstName(table.captain.name) : null,
      cart: {
        lines: cart.lines,
        itemCount: cart.itemCount,
        totals: toTotalsDto(computeTotals({ subtotal: cart.subtotal, gstRate })),
      },
      rounds: session.rounds.map((round) => guestRound(round, gstRate, previousNames)),
      billRequestedAt: session.billRequestedAt?.toISOString() ?? null,
      bill: guestBill(session, gstRate, guest.guestId),
      realtimeChannel: this.realtime.sessionChannel(session.id),
      serverTime: new Date().toISOString(),
    };
  }
}
