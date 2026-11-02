'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { currentOrderQuerySchema, type MenuItem } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { ArrowLeft, ShoppingCart, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import AddOrderItemDialog from '@/components/AddOrderItemDialog';
import OrderingMenu from '@/components/OrderingMenu';
import OrderItemEditors, { type OrderItemEditorsHandle } from '@/components/OrderItemEditors';
import SendOrderDialog from '@/components/SendOrderDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Sheet, SheetClose, SheetPortal, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import useMobileLayout from '@/hooks/useMobileLayout';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useAddOrderItem,
  useCurrentOrder,
  useFireOrder,
  useOpenOrder,
  useOrderingTable,
  useOrderReservations,
  useRemoveOrderItem,
  useUpdateOrderItemInstructions,
  useUpdateOrderItemQuantity,
} from '@/services/api/requests/orders';

import {
  getOpenOrderFormDefaults,
  openOrderFormSchema,
  type OpenOrderFormValues,
  toCreateOrderRequest,
} from './mappers';
import styles from './order.module.css';

type Props = { tableId: string };

export default function TableOrder({ tableId }: Props): ReactElement | null {
  const searchParams = useSearchParams();
  const isMobile = useMobileLayout();
  // The cart stays mounted in the same portal across mobile/desktop layouts, retaining RHF drafts.
  const cartMount = useRef<HTMLDivElement>(null);
  const [cartContainer, setCartContainer] = useState<HTMLDivElement | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const isAllowed = usePermissionGuard([Permission.ORDER_READ]);
  const { can } = usePermissions();
  // Editor handles expose the existing RHF drafts; no duplicate form/error state.
  const itemEditors = useRef(new Map<string, OrderItemEditorsHandle>());
  const preparingSend = useRef<Promise<void> | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const { mutateAsync: addOrderItem, ...addItem } = useAddOrderItem();
  const { mutateAsync: removeOrderItem, ...removeItem } = useRemoveOrderItem();
  const { mutateAsync: updateOrderItemQuantity, ...updateQuantity } = useUpdateOrderItemQuantity();
  const { mutateAsync: updateOrderItemInstructions, ...updateInstructions } =
    useUpdateOrderItemInstructions();
  const { mutateAsync: sendOrder, ...fireOrder } = useFireOrder();
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const isMutating =
    addItem.isPending ||
    removeItem.isPending ||
    updateQuantity.isPending ||
    updateInstructions.isPending ||
    fireOrder.isPending;
  const canUpdate = can(Permission.ORDER_UPDATE);
  const canWrite = can(Permission.ORDER_WRITE);
  const canReadMenu = can(Permission.MENU_READ);
  const isValidId = currentOrderQuerySchema.safeParse({ tableId }).success;
  const current = useCurrentOrder(tableId, isAllowed && isValidId);
  useEffect(() => {
    // An explicit null delays the portal until its grid host exists, avoiding a body fallback.
    setCartContainer(cartMount.current);
  }, [current.data?.id]);
  const { mutateAsync: openOrder, isPending: isOpening } = useOpenOrder();
  const table = useOrderingTable(
    tableId,
    isAllowed && isValidId && canWrite && current.data === null,
  );
  const reservations = useOrderReservations(
    tableId,
    isAllowed && isValidId && canWrite && current.data === null && can(Permission.RESERVATION_READ),
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpenOrderFormValues>({
    resolver: zodResolver(openOrderFormSchema),
    defaultValues: getOpenOrderFormDefaults(searchParams.get('reservationId') ?? ''),
  });

  async function onSubmit(values: OpenOrderFormValues): Promise<void> {
    try {
      await openOrder(toCreateOrderRequest(tableId, values));
    } catch {
      // useOpenOrder reports the API failure; retain the reservation choice for correction/retry.
    }
  }

  async function prepareSend(): Promise<void> {
    if (preparingSend.current) return preparingSend.current;
    const pending = (async (): Promise<void> => {
      // Reuse any blur-triggered save, and stop on validation or API failure.
      for (const editor of [...itemEditors.current.values()]) {
        if (!(await editor.save())) return;
      }
      fireOrder.reset();
      setIsSendDialogOpen(true);
    })();
    preparingSend.current = pending;
    try {
      await pending;
    } finally {
      preparingSend.current = null;
    }
  }

  if (!isAllowed) return null;

  const order = current.data;
  const canEdit = canUpdate && Boolean(order && ['OPEN', 'SUBMITTED'].includes(order.status));
  const activeItems = order?.items.filter((item) => item.status === 'ACTIVE') ?? [];
  const unsentItems = activeItems
    .filter((item) => item.quantity > item.sentQuantity)
    .map((item) => ({ ...item, quantity: item.quantity - item.sentQuantity }));
  const cancelledItems = order?.items.filter((item) => item.status === 'CANCELLED') ?? [];
  const error = current.error ?? table.error;
  const tableNumber = order?.table.tableNumber ?? table.data?.tableNumber;

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <Link
          href="/floor"
          className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to floor
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-sm font-semibold">
            {tableNumber ? `Table ${tableNumber}` : 'Table order'}
          </h1>
          {order && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge>{order.status}</Badge>
              {order.readyToServe && <Badge>Ready to serve</Badge>}
              <span className="hidden text-muted-foreground lg:inline">
                Opened{' '}
                <time dateTime={order.openedAt}>{new Date(order.openedAt).toLocaleString()}</time>
              </span>
              {order.reservationId && <span>Reservation linked</span>}
            </div>
          )}
        </div>
      </div>

      {!isValidId && <p role="alert">Invalid table link.</p>}

      {isValidId && current.isPending && (
        <p className="text-sm text-muted-foreground">Loading table order...</p>
      )}

      {error && (
        <div role="alert" className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(error, 'Unable to load the table order.')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void current.refetch();
              if (table.error) void table.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {current.data === null && !error && (
        <section className="max-w-lg space-y-4 rounded-lg border p-5" aria-label="Start order">
          <h2 className="text-xl font-semibold">No open order</h2>
          {canWrite ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <p className="text-sm text-muted-foreground">Start an order for this table.</p>
              <div className="space-y-2">
                <label htmlFor="order-reservation" className="text-sm font-medium">
                  Reservation
                </label>
                <NativeSelect
                  id="order-reservation"
                  disabled={isOpening || reservations.isPending || reservations.isError}
                  aria-invalid={Boolean(errors.reservationId)}
                  {...register('reservationId')}
                >
                  <NativeSelectOption value="">Select an active reservation</NativeSelectOption>
                  {(reservations.data ?? []).map((reservation) => (
                    <NativeSelectOption key={reservation.id} value={reservation.id}>
                      {reservation.guest.guestName} ·{' '}
                      {new Date(reservation.reservationAt).toLocaleString()}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {errors.reservationId && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.reservationId.message}
                  </p>
                )}
                {reservations.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Reservations could not be loaded. Retry before starting the order.
                    <Button type="button" variant="link" onClick={() => reservations.refetch()}>
                      Retry reservations
                    </Button>
                  </p>
                )}
              </div>
              {table.data && !table.data.isActive && (
                <p role="alert" className="text-sm text-destructive">
                  This table is inactive.
                </p>
              )}
              <Button
                type="submit"
                disabled={isOpening || current.isFetching || !table.data?.isActive}
              >
                {isOpening ? 'Opening order...' : 'Start order'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">There is no open order for this table.</p>
          )}
        </section>
      )}

      <Sheet
        open={Boolean(order) && (!isMobile || mobileCartOpen)}
        modal={isMobile}
        disablePointerDismissal
        onOpenChange={(open) => {
          if (isMobile) setMobileCartOpen(open);
        }}
      >
        {order && (
          <div className={styles.workspace}>
            <div ref={cartMount} className={styles.cartMount}>
              <SheetPortal container={cartContainer} keepMounted>
                <SheetPrimitive.Popup
                  role={isMobile ? 'dialog' : 'region'}
                  aria-modal={isMobile || undefined}
                  aria-label="Current order"
                  initialFocus={isMobile ? undefined : false}
                  finalFocus={isMobile ? undefined : false}
                  className={styles.cart}
                >
                  <SheetClose className={styles.backToMenu}>
                    <ArrowLeft className="size-4" aria-hidden /> Back to menu
                  </SheetClose>
                  <div className="shrink-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border bg-muted px-5 py-1 text-sm font-medium">
                        Dine-in
                      </span>
                      <SheetTitle className="text-sm text-muted-foreground">
                        Current order
                      </SheetTitle>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                      <Utensils className="size-4 text-muted-foreground" aria-hidden />
                      <span>{tableNumber ? `Table ${tableNumber}` : 'Table order'}</span>
                    </div>
                  </div>
                  <div className={styles.cartItems}>
                    {activeItems.length === 0 && (
                      <div className="flex h-full min-h-52 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                        <ShoppingCart className="size-8 opacity-50" aria-hidden />
                        <p>Cart is empty</p>
                        <p className="max-w-52 text-xs">
                          {canEdit && canReadMenu
                            ? 'No active items. Add an item from the menu.'
                            : 'No active items in this order.'}
                        </p>
                      </div>
                    )}
                    <ul className="space-y-4">
                      {activeItems.map((item) => (
                        <li key={item.id} className="space-y-2 border-b pb-4 text-sm last:border-0">
                          <div className="flex items-start justify-between gap-3 font-medium">
                            <p>{item.name}</p>
                            <span className="shrink-0 tabular-nums">{item.lineTotal}</span>
                          </div>
                          <p className="text-muted-foreground">
                            {item.quantity} × {item.unitPrice}
                          </p>
                          {canEdit && (
                            <OrderItemEditors
                              ref={(editor) => {
                                if (editor) itemEditors.current.set(item.id, editor);
                                else itemEditors.current.delete(item.id);
                              }}
                              item={item}
                              disabled={isMutating || isSendDialogOpen}
                              onQuantity={async (input) => {
                                await updateOrderItemQuantity({
                                  orderId: order.id,
                                  itemId: item.id,
                                  input,
                                });
                              }}
                              onInstructions={async (input) => {
                                await updateOrderItemInstructions({
                                  orderId: order.id,
                                  itemId: item.id,
                                  input,
                                });
                              }}
                            />
                          )}
                          {(!canEdit || item.sentQuantity > 0) && item.specialInstructions && (
                            <p className="break-words">{item.specialInstructions}</p>
                          )}
                          {item.sentQuantity > 0 && (
                            <Badge variant="secondary">
                              {item.sentQuantity === item.quantity
                                ? 'Sent to kitchen'
                                : `${item.sentQuantity} of ${item.quantity} sent to kitchen`}
                            </Badge>
                          )}
                          {canEdit && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isMutating || item.sentQuantity > 0}
                              aria-label={`Remove ${item.name} from order`}
                              title={
                                item.sentQuantity > 0
                                  ? 'Items sent to the kitchen cannot be removed'
                                  : undefined
                              }
                              onClick={async () => {
                                try {
                                  await removeOrderItem({ orderId: order.id, itemId: item.id });
                                } catch {
                                  // The request hook reports the error and leaves the line available.
                                }
                              }}
                            >
                              {removeItem.isPending && removeItem.variables?.itemId === item.id
                                ? 'Removing...'
                                : 'Remove'}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {cancelledItems.length > 0 && (
                      <details className="border-t pt-3 text-sm text-muted-foreground">
                        <summary className="cursor-pointer">
                          Cancelled items ({cancelledItems.length})
                        </summary>
                        <ul className="mt-3 space-y-2">
                          {cancelledItems.map((item) => (
                            <li key={item.id}>
                              <p>
                                {item.name} · {item.quantity} × {item.unitPrice}
                              </p>
                              {item.specialInstructions && (
                                <p className="break-words">{item.specialInstructions}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className={styles.cartFooter}>
                    <div
                      aria-live="polite"
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold tabular-nums">{order.total}</span>
                    </div>
                    {canEdit && (
                      <Button
                        type="button"
                        className="h-11 w-full rounded-2xl"
                        disabled={isMutating || unsentItems.length === 0}
                        onClick={() => void prepareSend()}
                      >
                        Send to kitchen
                      </Button>
                    )}
                  </div>
                </SheetPrimitive.Popup>
              </SheetPortal>
            </div>
            {canReadMenu && (
              <div className={styles.menuPanel}>
                <OrderingMenu
                  onAdd={
                    canEdit
                      ? async (item) => {
                          setSelectedItem(item);
                        }
                      : undefined
                  }
                  isAdding={isMutating}
                />
              </div>
            )}
          </div>
        )}
        {order && (
          <SheetTrigger className={styles.viewCart}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-5" aria-hidden />
              <span>
                View cart · {activeItems.reduce((total, item) => total + item.quantity, 0)} items
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{order.total}</span>
          </SheetTrigger>
        )}
        {selectedItem && order && canEdit && (
          <AddOrderItemDialog
            key={`${order.id}:${selectedItem.id}`}
            item={selectedItem}
            isPending={isMutating}
            onClose={() => setSelectedItem(null)}
            onAdd={async (input) => {
              await addOrderItem({ ...input, orderId: order.id });
            }}
          />
        )}
        {isSendDialogOpen && order && (
          <SendOrderDialog
            items={unsentItems}
            result={fireOrder.data}
            isPending={isMutating}
            onConfirm={() => sendOrder(order.id)}
            onClose={() => {
              setIsSendDialogOpen(false);
              fireOrder.reset();
            }}
          />
        )}
      </Sheet>
    </main>
  );
}
