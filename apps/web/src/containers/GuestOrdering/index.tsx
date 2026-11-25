'use client';

import './guest.css';

import type { QrChangedEvent, QrMenuItem, QrSessionResponse } from '@rms/api-contract';
import { BellRing, PartyPopper } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  clearGuest,
  errorStatus,
  guestErrorMessage,
  useAddToCart,
  useCallServer,
  useGuestSecret,
  useQrMenu,
  useQrResolve,
  useQrSession,
  useRequestBill,
  useRequestPayment,
  useRestoreRound,
  useSplit,
  useSubmitRound,
  useUpdateCartLine,
} from './api';
import { BillView, PaidView, PaymentPendingSheet, type SplitRequest, SplitView } from './BillViews';
import CartView from './CartView';
import {
  InvalidQr,
  MenuSkeleton,
  OfflineBanner,
  RestaurantClosed,
  TableInactive,
  TableUnavailable,
} from './EdgeStates';
import ItemSheet from './ItemSheet';
import JoinView from './JoinView';
import MenuView from './MenuView';
import type { Brand } from './parts';
import TrackerView from './TrackerView';
import useGuestRealtime from './useGuestRealtime';

type View = 'menu' | 'cart' | 'order' | 'bill' | 'split';
const VIEWS: readonly View[] = ['menu', 'cart', 'order', 'bill', 'split'];

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Guest QR ordering app (REST-88): public, mobile-first, restaurant-branded; no staff shell. */
export default function GuestOrdering({ token }: { token: string }): ReactElement {
  const resolve = useQrResolve(token);
  const [viewMenuWhileClosed, setViewMenuWhileClosed] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);
  const [unblockedBanner, setUnblockedBanner] = useState(false);
  const previousState = useRef<string | null>(null);
  const data = resolve.data;
  const brand: Brand | null = data
    ? {
        name: data.restaurant.name,
        initials: data.restaurant.initials,
        brandColor: data.restaurant.brandColor,
        guestPhone: data.restaurant.guestPhone,
      }
    : null;
  const menu = useQrMenu(token, Boolean(data));

  useEffect(() => {
    if (!data) return;
    if (previousState.current === 'NO_CAPTAIN' && data.state === 'OPEN') setUnblockedBanner(true);
    previousState.current = data.state;
  }, [data]);

  const style = { '--brand': brand?.brandColor ?? '#B3401C' } as CSSProperties;
  let content: ReactElement;
  if (resolve.isPending) content = <MenuSkeleton />;
  else if (errorStatus(resolve.error) === 404) content = <InvalidQr />;
  else if (!data || !brand)
    content = (
      <>
        <OfflineBanner onRetry={() => void resolve.refetch()} />
        <MenuSkeleton />
      </>
    );
  else if (data.state === 'TABLE_INACTIVE') content = <TableInactive brand={brand} />;
  else if (data.state === 'CLOSED' && !viewMenuWhileClosed)
    content = <RestaurantClosed brand={brand} onViewMenu={() => setViewMenuWhileClosed(true)} />;
  else if (
    (data.state === 'TABLE_RESERVED' || data.state === 'TABLE_CLEANING') &&
    !viewMenuWhileClosed
  )
    content = (
      <TableUnavailable
        brand={brand}
        reason={data.state === 'TABLE_RESERVED' ? 'reserved' : 'cleaning'}
        onViewMenu={() => setViewMenuWhileClosed(true)}
      />
    );
  else if (!menu.data) content = <MenuSkeleton />;
  else if (data.state !== 'OPEN')
    content = (
      <MenuView
        brand={brand}
        tableNumber={data.table.number}
        captainName={null}
        menu={menu.data}
        session={null}
        mode={data.state === 'NO_CAPTAIN' ? 'blocked' : 'view'}
        onOpenItem={() => undefined}
        onQuickAdd={() => undefined}
        onSetQuantity={() => undefined}
        onViewOrder={() => undefined}
        tryingAgain={resolve.isFetching}
        stillBlocked={stillBlocked}
        onTryAgain={() =>
          void resolve
            .refetch()
            .then((result) => setStillBlocked(result.data?.state === 'NO_CAPTAIN'))
        }
      />
    );
  else
    content = (
      <OrderingApp
        token={token}
        brand={brand}
        tableNumber={data.table.number}
        captainName={data.captainName ?? 'your server'}
        menu={menu.data}
        realtime={data.realtime}
        banner={
          unblockedBanner ? (
            <div
              className="qr-slidein row"
              role="status"
              style={{
                gap: 10,
                margin: '12px 16px 0',
                padding: '12px 14px',
                borderRadius: 14,
                background: 'var(--qs-rd-b)',
                color: 'var(--qs-rd-f)',
                fontWeight: 600,
              }}
            >
              <PartyPopper size={18} aria-hidden /> Ordering is on. Your server is{' '}
              {data.captainName}.
            </div>
          ) : null
        }
      />
    );

  return (
    <div className="qrg-page">
      <main className="qrg" style={style}>
        {content}
      </main>
    </div>
  );
}

function OrderingApp({
  token,
  brand,
  tableNumber,
  captainName,
  menu,
  realtime,
  banner,
}: {
  token: string;
  brand: Brand;
  tableNumber: string;
  captainName: string;
  menu: NonNullable<ReturnType<typeof useQrMenu>['data']>;
  realtime: { key: string; cluster: string };
  banner: ReactElement | null;
}): ReactElement {
  const secret = useGuestSecret(token);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const [live, setLive] = useState(false);
  const session = useQrSession(token, secret, live);
  const [toast, setToast] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<QrMenuItem | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [pendingShareId, setPendingShareId] = useState<string | null>(null);
  const sendKey = useRef<string | null>(null);

  const add = useAddToCart(token, secret);
  const update = useUpdateCartLine(token, secret);
  const submit = useSubmitRound(token, secret);
  const restore = useRestoreRound(token, secret);
  const requestBill = useRequestBill(token, secret);
  const split = useSplit(token, secret);
  const pay = useRequestPayment(token, secret);
  const callServer = useCallServer(token, secret);

  const onEvent = useCallback((event: QrChangedEvent) => {
    if (event.kind === 'round.ready') setToast('Your food is on its way');
  }, []);
  const realtimeState = useGuestRealtime({
    token,
    secret,
    channel: session.data?.realtimeChannel ?? null,
    config: realtime,
    onEvent,
  });
  useEffect(() => setLive(realtimeState.live), [realtimeState.live]);

  // "Your food is on its way": fire once when a round turns ready (live or after a resync).
  const lastStatuses = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const rounds = session.data?.rounds;
    if (!rounds) return;
    const previous = lastStatuses.current;
    lastStatuses.current = new Map(rounds.map((round) => [round.id, round.status]));
    if (!previous) return;
    if (rounds.some((round) => round.status === 'ready' && previous.get(round.id) !== 'ready')) {
      setToast('Your food is on its way');
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        // optional
      }
    }
  }, [session.data?.rounds]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // A rotated card, a closed visit or a cleared device all lead back to the name/phone screen.
  const status = errorStatus(session.error);
  useEffect(() => {
    if (status === 401 || status === 410) clearGuest(token);
  }, [status, token]);

  const requested = params.get('v') as View | null;
  const hasRounds = (session.data?.rounds.length ?? 0) > 0;
  const view: View =
    requested && VIEWS.includes(requested) ? requested : hasRounds ? 'order' : 'menu';
  const go = useCallback(
    (next: View, replace = false) => {
      const url = next === 'menu' && !hasRounds ? pathname : `${pathname}?v=${next}`;
      if (replace) router.replace(url, { scroll: true });
      else router.push(url, { scroll: true });
    },
    [hasRounds, pathname, router],
  );

  if (!secret) {
    return (
      <JoinView token={token} brand={brand} tableNumber={tableNumber} captainName={captainName} />
    );
  }
  if (!session.data) {
    return session.isError && status !== 401 && status !== 410 ? (
      <>
        <OfflineBanner onRetry={() => void session.refetch()} />
        <MenuSkeleton />
      </>
    ) : (
      <MenuSkeleton />
    );
  }

  const data: QrSessionResponse = session.data;
  const offline = !online || (session.isError && status === undefined);
  const bill = data.bill;
  const pendingShare = bill?.shares.find((share) => share.id === pendingShareId) ?? null;

  if (data.status === 'CLOSED' && bill) {
    return <PaidView bill={bill} restaurantName={brand.name} tableNumber={tableNumber} />;
  }

  async function sendOrder(note: string): Promise<void> {
    setCartError(null);
    sendKey.current ??= crypto.randomUUID();
    try {
      await submit.mutateAsync({
        idempotencyKey: sendKey.current,
        ...(note.trim() && { note: note.trim() }),
      });
      sendKey.current = null;
      go('order', true);
    } catch (error) {
      setCartError(guestErrorMessage(error));
    }
  }

  async function doSplit(request: SplitRequest): Promise<QrSessionResponse | null> {
    setSplitError(null);
    try {
      return await split.mutateAsync(request);
    } catch (error) {
      setSplitError(guestErrorMessage(error));
      return null;
    }
  }

  async function doPay(shareId: string, method: 'UPI' | 'CASH'): Promise<void> {
    setSplitError(null);
    try {
      await pay.mutateAsync({ shareId, input: { method } });
      setPendingShareId(shareId);
    } catch (error) {
      setSplitError(guestErrorMessage(error));
    }
  }

  let body: ReactElement;
  if (view === 'cart') {
    body = (
      <CartView
        session={data}
        tableNumber={tableNumber}
        captainName={captainName}
        onBack={() => router.back()}
        onSetQuantity={(lineId, quantity) => update.mutate({ lineId, quantity })}
        onSend={(note) => void sendOrder(note)}
        sending={submit.isPending}
        error={cartError}
      />
    );
  } else if (view === 'order') {
    body = (
      <TrackerView
        session={data}
        tableNumber={tableNumber}
        offline={offline}
        onBack={() => go('menu')}
        onCallServer={() =>
          callServer.mutate(undefined, {
            onSuccess: () => setToast(`${captainName} has been told`),
            onError: (error) => setToast(guestErrorMessage(error)),
          })
        }
        calling={callServer.isPending}
        onAddMore={() => go('menu')}
        onEditRejected={(roundId) =>
          restore.mutate(roundId, {
            onSuccess: () => go('cart'),
            onError: (error) => setToast(guestErrorMessage(error)),
          })
        }
        restoring={restore.isPending}
        onRequestBill={() =>
          data.billRequestedAt
            ? go('bill')
            : requestBill.mutate(undefined, {
                onSuccess: () => go('bill'),
                onError: (error) => setToast(guestErrorMessage(error)),
              })
        }
        requestingBill={requestBill.isPending}
        onOpenCart={() => go('cart')}
      />
    );
  } else if ((view === 'bill' || view === 'split') && bill) {
    body =
      view === 'bill' ? (
        <BillView
          session={data}
          bill={bill}
          tableNumber={tableNumber}
          captainName={captainName}
          onBack={() => router.back()}
          onSplit={() => go('split')}
          busy={split.isPending || pay.isPending}
          onPayFull={() =>
            void doSplit({ mode: 'FULL' }).then((next) => {
              const share = next?.bill?.shares.find((s) => s.isMine && s.status !== 'PAID');
              if (share) void doPay(share.id, 'UPI');
            })
          }
        />
      ) : (
        <SplitView
          session={data}
          bill={bill}
          captainName={captainName}
          onBack={() => router.back()}
          onSplit={doSplit}
          onPay={(shareId, method) => void doPay(shareId, method)}
          busy={split.isPending || pay.isPending}
          error={splitError}
        />
      );
  } else {
    body = (
      <MenuView
        brand={brand}
        tableNumber={tableNumber}
        captainName={captainName}
        menu={menu}
        session={data}
        mode="order"
        banner={banner}
        onOpenItem={setOpenItem}
        onQuickAdd={(item) =>
          add.mutate(
            { menuItemId: item.id, quantity: 1 },
            { onError: (error) => setToast(guestErrorMessage(error)) },
          )
        }
        onSetQuantity={(lineId, quantity) => update.mutate({ lineId, quantity })}
        onViewOrder={() => go('cart')}
        onTrackOrder={() => go('order')}
      />
    );
  }

  return (
    <>
      {offline && <OfflineBanner onRetry={() => void session.refetch()} />}
      {body}
      {toast && (
        <div className="toast qr-slidein" role="status" aria-live="assertive">
          <BellRing size={20} style={{ color: '#6EE7B7', flex: 'none' }} aria-hidden />
          <b>{toast}</b>
        </div>
      )}
      {openItem && (
        <ItemSheet
          item={openItem}
          adding={add.isPending}
          onClose={() => setOpenItem(null)}
          onAdd={(quantity, instructions) =>
            add.mutate(
              {
                menuItemId: openItem.id,
                quantity,
                ...(instructions.trim() && { specialInstructions: instructions.trim() }),
              },
              {
                onSuccess: () => setOpenItem(null),
                onError: (error) => setToast(guestErrorMessage(error)),
              },
            )
          }
        />
      )}
      {pendingShare && (
        <PaymentPendingSheet
          share={pendingShare}
          captainName={captainName}
          onClose={() => setPendingShareId(null)}
        />
      )}
    </>
  );
}
