'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { currentOrderQuerySchema, type MenuItem } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';

import AddOrderItemDialog from '@/components/AddOrderItemDialog';
import OrderingMenu from '@/components/OrderingMenu';
import OrderItemEditors from '@/components/OrderItemEditors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useAddOrderItem,
  useCurrentOrder,
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

type Props = { tableId: string };

export default function TableOrder({ tableId }: Props): ReactElement | null {
  const searchParams = useSearchParams();
  const isAllowed = usePermissionGuard([Permission.ORDER_READ]);
  const { can } = usePermissions();
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const addItem = useAddOrderItem();
  const removeItem = useRemoveOrderItem();
  const updateQuantity = useUpdateOrderItemQuantity();
  const updateInstructions = useUpdateOrderItemInstructions();
  const isMutating =
    addItem.isPending ||
    removeItem.isPending ||
    updateQuantity.isPending ||
    updateInstructions.isPending;
  const canUpdate = can(Permission.ORDER_UPDATE);
  const canWrite = can(Permission.ORDER_WRITE);
  const canReadMenu = can(Permission.MENU_READ);
  const isValidId = currentOrderQuerySchema.safeParse({ tableId }).success;
  const current = useCurrentOrder(tableId, isAllowed && isValidId);
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

  if (!isAllowed) return null;

  const order = current.data;
  const canEdit = canUpdate && order?.status === 'OPEN';
  const activeItems = order?.items.filter((item) => item.status === 'ACTIVE') ?? [];
  const cancelledItems = order?.items.filter((item) => item.status === 'CANCELLED') ?? [];
  const error = current.error ?? table.error;
  const tableNumber = order?.table.tableNumber ?? table.data?.tableNumber;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <Link href="/floor" className="text-sm text-muted-foreground underline underline-offset-4">
        Back to floor
      </Link>
      <div className="mt-5 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {tableNumber ? `Table ${tableNumber}` : 'Table order'}
        </h1>
        {order && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Badge>{order.status}</Badge>
            <span className="text-muted-foreground">
              Opened{' '}
              <time dateTime={order.openedAt}>{new Date(order.openedAt).toLocaleString()}</time>
            </span>
            {order.reservationId && <span>Reservation linked</span>}
          </div>
        )}
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

      {order && (
        <div className="grid items-start gap-8 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section
            aria-label="Current order"
            className="min-w-0 space-y-4 rounded-lg border p-5 md:order-2"
          >
            <h2 className="text-xl font-semibold">Current order</h2>
            {activeItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {canEdit && canReadMenu
                  ? 'No active items. Add an item from the menu.'
                  : 'No active items in this order.'}
              </p>
            )}
            <ul className="space-y-3">
              {activeItems.map((item) => (
                <li key={item.id} className="space-y-1 text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-muted-foreground">
                    {item.quantity} × {item.unitPrice} = {item.lineTotal}
                  </p>
                  {canEdit && !item.isSentToKitchen && (
                    <OrderItemEditors
                      item={item}
                      disabled={isMutating}
                      onQuantity={async (input) => {
                        await updateQuantity.mutateAsync({
                          orderId: order.id,
                          itemId: item.id,
                          input,
                        });
                      }}
                      onInstructions={async (input) => {
                        await updateInstructions.mutateAsync({
                          orderId: order.id,
                          itemId: item.id,
                          input,
                        });
                      }}
                    />
                  )}
                  {(!canEdit || item.isSentToKitchen) && item.specialInstructions && (
                    <p className="break-words">{item.specialInstructions}</p>
                  )}
                  {item.isSentToKitchen && <Badge variant="secondary">Sent to kitchen</Badge>}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isMutating || item.isSentToKitchen}
                      aria-label={`Remove ${item.name} from order`}
                      title={
                        item.isSentToKitchen
                          ? 'Items sent to the kitchen cannot be removed'
                          : undefined
                      }
                      onClick={async () => {
                        try {
                          await removeItem.mutateAsync({ orderId: order.id, itemId: item.id });
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
            <div aria-live="polite" className="flex justify-between border-t pt-4 font-semibold">
              <span>Total</span>
              <span>{order.total}</span>
            </div>
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
          </section>
          {canReadMenu && (
            <div className="min-w-0 md:order-1">
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
      {selectedItem && order && canEdit && (
        <AddOrderItemDialog
          key={`${order.id}:${selectedItem.id}`}
          item={selectedItem}
          isPending={isMutating}
          onClose={() => setSelectedItem(null)}
          onAdd={async (input) => {
            await addItem.mutateAsync({ ...input, orderId: order.id });
          }}
        />
      )}
    </main>
  );
}
