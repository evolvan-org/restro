'use client';

import './qr-print.css';

import {
  QR_DEFAULT_BRAND_COLOR,
  QR_ESCALATION_MAX_MINUTES,
  QR_ESCALATION_MIN_MINUTES,
  type QrTableCard,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { contrastRatio, isReadableWithWhite } from '@rms/shared';
import { Download, ImageUp, Minus, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useDeleteUpiQr,
  useQrCards,
  useQrSettings,
  useRotateQrToken,
  useUpdateQrSettings,
  useUpiQrImage,
  useUploadUpiQr,
} from '@/services/api/requests/qr-orders';

import { type CardBrand, downloadCanvas, downloadTentPdf, renderFace, rotated } from './cards';

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[26px] w-11 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      style={{ background: checked ? 'var(--primary)' : 'var(--border)' }}
    >
      <span
        className="absolute top-[3px] size-5 rounded-full transition-all"
        style={{
          left: checked ? 21 : 3,
          background: checked ? 'var(--primary-foreground)' : '#fff',
        }}
        aria-hidden
      />
    </button>
  );
}

/** Settings → QR ordering (A1): switch, timeout, guest phone, brand, UPI QR, and table cards. */
export default function QrSettings(): ReactElement {
  const { can } = usePermissions();
  const canWrite = can(Permission.QR_SETTINGS_WRITE);
  const settings = useQrSettings(true);
  const update = useUpdateQrSettings();
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState(3);
  const [phone, setPhone] = useState('');
  const [brand, setBrand] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.enabled);
    setMinutes(settings.data.escalationMinutes);
    setPhone(settings.data.guestPhone ?? '');
    setBrand(settings.data.brandColor ?? '');
  }, [settings.data]);

  const dirty =
    settings.data &&
    (enabled !== settings.data.enabled ||
      minutes !== settings.data.escalationMinutes ||
      phone !== (settings.data.guestPhone ?? '') ||
      brand.toUpperCase() !== (settings.data.brandColor ?? ''));
  const brandValid = brand === '' || /^#[0-9a-fA-F]{6}$/.test(brand);
  const ratio = brandValid && brand ? contrastRatio(brand, '#FFFFFF') : null;

  async function save(): Promise<void> {
    setErrors([]);
    try {
      await update.mutateAsync({
        enabled,
        escalationMinutes: minutes,
        guestPhone: phone,
        brandColor: brand,
      });
      toast.success('QR ordering settings saved');
    } catch (error) {
      setErrors([getApiErrorMessage(error, 'Could not save the settings.')]);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-7">
      <h1 className="mb-4 text-xl font-bold">QR ordering</h1>
      {settings.data && !canWrite && (
        <p
          className="mb-4 rounded-[9px] bg-muted px-3.5 py-2.5 text-sm text-muted-foreground"
          role="note"
        >
          You can view these settings. Changing them needs the “Edit QR ordering settings and cards”
          permission; ask the account owner or a manager.
        </p>
      )}
      <div className="rounded-[10px] border bg-card px-5 py-1">
        <Row
          title="QR ordering"
          description="Guests scan the QR code on their table to browse the menu and order from their phone."
        >
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label="QR ordering"
            disabled={!canWrite}
          />
        </Row>
        <Row
          title="Captain approval"
          description="Every guest order goes to the table’s captain before it reaches the kitchen. Always on."
        >
          <span className="text-sm font-semibold text-muted-foreground">Always on</span>
        </Row>
        <Row
          title="Escalation timeout"
          description="If the captain hasn’t acted in this time, managers are alerted. If the captain is logged out, orders escalate straight away."
        >
          <div className="flex h-11 items-center rounded-[7px] border">
            <button
              type="button"
              aria-label="One minute less"
              className="flex h-11 w-11 items-center justify-center disabled:opacity-40"
              disabled={!canWrite || minutes <= QR_ESCALATION_MIN_MINUTES}
              onClick={() => setMinutes((m) => m - 1)}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <b className="w-[70px] text-center tabular-nums" aria-live="polite">
              {minutes} min
            </b>
            <button
              type="button"
              aria-label="One minute more"
              className="flex h-11 w-11 items-center justify-center disabled:opacity-40"
              disabled={!canWrite || minutes >= QR_ESCALATION_MAX_MINUTES}
              onClick={() => setMinutes((m) => m + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </Row>
        <Row
          title="Restaurant phone shown to guests"
          description="Used on the “Call restaurant” button when a table can’t take orders."
        >
          <label className="sr-only" htmlFor="qr-guest-phone">
            Restaurant phone shown to guests
          </label>
          <input
            id="qr-guest-phone"
            type="tel"
            value={phone}
            disabled={!canWrite}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 80 4123 4567"
            className="h-11 w-full rounded-[7px] border bg-background px-3 sm:w-[230px]"
          />
        </Row>
        <Row
          title="Brand colour"
          description="Buttons and accents in the guest app. White text on it must reach 4.5:1."
        >
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                value={brandValid && brand ? brand : QR_DEFAULT_BRAND_COLOR}
                disabled={!canWrite}
                onChange={(event) => setBrand(event.target.value.toUpperCase())}
                className="h-11 w-11 cursor-pointer rounded-[7px] border bg-background p-1"
              />
              <label className="sr-only" htmlFor="qr-brand">
                Brand colour hex
              </label>
              <input
                id="qr-brand"
                value={brand}
                disabled={!canWrite}
                onChange={(event) => setBrand(event.target.value.trim())}
                placeholder={QR_DEFAULT_BRAND_COLOR}
                className="h-11 w-[110px] rounded-[7px] border bg-background px-3 font-mono uppercase"
                aria-invalid={!brandValid || (ratio !== null && ratio < 4.5)}
              />
            </div>
            {ratio !== null && (
              <span
                className="text-xs"
                style={{ color: isReadableWithWhite(brand) ? 'var(--qs-rd-f)' : 'var(--qs-rj-f)' }}
              >
                {ratio.toFixed(1)}:1 with white text
                {isReadableWithWhite(brand) ? ' · passes' : ' · too light'}
              </span>
            )}
          </div>
        </Row>
        <UpiQrRow canWrite={canWrite} hasQr={settings.data?.hasUpiQr ?? false} />
      </div>
      {errors.length > 0 && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errors.join(' ')}
        </p>
      )}
      {canWrite && (
        <div className="mt-4 flex justify-end">
          <Button
            className="min-h-11"
            disabled={!dirty || !brandValid || update.isPending}
            onClick={() => void save()}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
      {canWrite && <TableCards />}
    </div>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-1 flex-col gap-0.5">
        <b>{title}</b>
        <span className="text-[13px] text-muted-foreground">{description}</span>
      </div>
      {children}
    </div>
  );
}

/** The restaurant's own UPI QR: captains show it to guests and confirm the payment manually. */
function UpiQrRow({ canWrite, hasQr }: { canWrite: boolean; hasQr: boolean }): ReactElement {
  const upload = useUploadUpiQr();
  const remove = useDeleteUpiQr();
  const image = useUpiQrImage(hasQr);

  async function onFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Upload a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > 1_000_000) {
      toast.error('The image must be 1 MB or smaller.');
      return;
    }
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    try {
      await upload.mutateAsync({
        mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
        data: window.btoa(binary),
      });
      toast.success('UPI QR code saved');
    } catch {
      // Hook shows the error.
    }
  }

  return (
    <Row
      title="UPI QR code"
      description="Upload your restaurant’s UPI QR. When a guest pays, the captain shows it to them and confirms the payment."
    >
      <div className="flex items-center gap-3">
        {hasQr && image.data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.data}
            alt="Your UPI QR code"
            className="size-16 rounded-md border bg-white object-contain p-1"
          />
        )}
        {canWrite && (
          <>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold">
              <ImageUp className="size-4" aria-hidden /> {hasQr ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => void onFile(event)}
              />
            </label>
            {hasQr && (
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Remove UPI QR code"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </>
        )}
        {!hasQr && !canWrite && <span className="text-sm text-muted-foreground">Not uploaded</span>}
      </div>
    </Row>
  );
}

type Face = { card: QrTableCard; face: HTMLCanvasElement; url: string };

/** QR table cards: preview, PNG, print, regenerate; all at once as PDF or printed A6 tents. */
function TableCards(): ReactElement {
  const cards = useQrCards(true);
  const rotate = useRotateQrToken();
  const [faces, setFaces] = useState<Face[]>([]);
  const [printing, setPrinting] = useState<Face[]>([]);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const data = cards.data;
  const brand: CardBrand | null = useMemo(
    () =>
      data
        ? {
            name: data.restaurant.name,
            initials: data.restaurant.initials,
            brandColor: data.restaurant.brandColor,
          }
        : null,
    [data],
  );

  useEffect(() => {
    if (!data || !brand) return;
    let cancelled = false;
    void (async () => {
      const rendered: Face[] = [];
      for (const card of data.data.filter((c) => c.isActive)) {
        const face = await renderFace({
          brand,
          tableNumber: card.tableNumber,
          token: card.token,
          origin: window.location.origin,
        });
        rendered.push({ card, face, url: face.toDataURL('image/png') });
      }
      if (!cancelled) setFaces(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, brand]);

  function print(selection: Face[]): void {
    flushSync(() => setPrinting(selection));
    window.print();
  }

  const fileBase = (data?.restaurant.name ?? 'restaurant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return (
    <section className="mt-7" aria-labelledby="qr-cards-title">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-col">
          <h2 id="qr-cards-title" className="text-lg font-bold">
            QR table cards
          </h2>
          <span className="text-[13px] text-muted-foreground">
            One card per table. The captain isn’t printed, so cards stay valid when staff change.
          </span>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={faces.length === 0}
          onClick={() =>
            void downloadTentPdf(
              faces.map((f) => ({ tableNumber: f.card.tableNumber, face: f.face })),
              `${fileBase}-qr-table-cards.pdf`,
            )
          }
        >
          <Download aria-hidden /> Download all (PDF)
        </Button>
        <Button className="min-h-11" disabled={faces.length === 0} onClick={() => print(faces)}>
          <Printer aria-hidden /> Print all · A6 tent
        </Button>
      </div>
      {cards.isPending || (data && faces.length === 0 && data.data.some((c) => c.isActive)) ? (
        <div
          className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          {[0, 1, 2].map((key) => (
            <div key={key} className="qr-skeleton h-[150px]" />
          ))}
        </div>
      ) : (
        <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {faces.map((item) => (
            <div key={item.card.tableId} className="rounded-[10px] border bg-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`QR card for table ${item.card.tableNumber}`}
                className="w-full rounded-md border"
              />
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <b className="text-lg">Table {item.card.tableNumber}</b>
                  <span className="text-xs text-muted-foreground">{item.card.section}</span>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 flex-1"
                  onClick={() =>
                    downloadCanvas(item.face, `${fileBase}-table-${item.card.tableNumber}.png`)
                  }
                >
                  <Download aria-hidden /> PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 flex-1"
                  onClick={() => print([item])}
                >
                  <Printer aria-hidden /> Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-9"
                  aria-label={`New QR code for table ${item.card.tableNumber}`}
                  title="New code (the old card stops working)"
                  onClick={() => setConfirmRotate(item.card.tableId)}
                >
                  <RefreshCw aria-hidden />
                </Button>
              </div>
              {confirmRotate === item.card.tableId && (
                <div className="mt-2.5 rounded-md bg-muted p-2.5 text-[13px]" role="alert">
                  The printed card for this table will stop working.
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={rotate.isPending}
                      onClick={() =>
                        rotate.mutate(item.card.tableId, {
                          onSuccess: () => {
                            setConfirmRotate(null);
                            toast.success(
                              `New code for table ${item.card.tableNumber}. Print the new card.`,
                            );
                          },
                        })
                      }
                    >
                      Make a new code
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="qr-print" aria-hidden>
        {printing.map((item) => (
          <div key={item.card.tableId} className="qr-print-sheet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rotated(item.face).toDataURL('image/png')} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" />
            <div className="qr-print-fold" />
          </div>
        ))}
      </div>
    </section>
  );
}
