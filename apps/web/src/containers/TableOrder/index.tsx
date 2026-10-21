'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { currentOrderQuerySchema } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import OrderingMenu from '@/components/OrderingMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useCurrentOrder,
  useOpenOrder,
  useOrderingTable,
  useOrderReservations,
} from '@/services/api/requests/orders';

import {
  getOpenOrderFormDefaults,
  openOrderFormSchema,
  type OpenOrderFormValues,
  toCreateOrderRequest,
} from './mappers';

type Props = { tableId: string };

export default function TableOrder({ tableId }: Props): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.ORDER_READ]);
  const { can } = usePermissions();
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
    defaultValues: getOpenOrderFormDefaults(),
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
                  Reservation (optional)
                </label>
                <NativeSelect
                  id="order-reservation"
                  disabled={isOpening || reservations.isPending || reservations.isError}
                  aria-invalid={Boolean(errors.reservationId)}
                  {...register('reservationId')}
                >
                  <NativeSelectOption value="">No reservation / walk-in</NativeSelectOption>
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
                    Reservations could not be loaded. You can retry or start without one.
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
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {canReadMenu && <OrderingMenu />}
          <section aria-label="Current order" className="space-y-4 rounded-lg border p-5">
            <h2 className="text-xl font-semibold">Current order</h2>
            {order.items.length === 0 && (
              <p className="text-sm text-muted-foreground">No items in this order yet.</p>
            )}
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li key={item.id} className="space-y-1 text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-muted-foreground">
                    {item.quantity} × {item.unitPrice} · {item.status}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
