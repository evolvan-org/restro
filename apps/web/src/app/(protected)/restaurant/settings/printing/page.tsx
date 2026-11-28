'use client';

import {
  sampleThermalReceipt,
  sampleThermalTicket,
  type ThermalConfiguration,
  type ThermalDestination,
  type ThermalSettings,
  thermalSettingsSchema,
  type ThermalTicketLayout,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import printStyles from '@/components/ThermalPrint/thermal.module.css';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useCheckThermalConnection,
  usePairPrintConnector,
  usePrintConnectorStatus,
  useRevokePrintConnector,
  useThermalPrinterStatus,
  useThermalTestPrint,
  useUpdateThermalSettings,
} from '@/services/api/requests/thermal-printing';

const names = { RECEIPT: 'Receipts', KITCHEN: 'Kitchen tickets', BAR: 'Bar tickets' };
const connectionNames = { usb: 'USB on the restaurant computer', network: 'Network printer' };
const connectorCommand =
  'node restro-print-connector.mjs --pair ' +
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000');
const connections = ['usb', 'network'] as const;
const widths = ['58', '80'] as const;

type PrinterForm = Omit<
  ThermalSettings,
  'network' | 'columns' | 'usbDevice' | 'ticketLayout' | 'autoPrint'
> & {
  host: string;
  port: string;
  usbDevice: string;
  columns: string;
  ticketLayout: ThermalTicketLayout;
  autoPrint: boolean;
};

function defaults(config: ThermalConfiguration): PrinterForm {
  return {
    connection: config.connection,
    paper: config.paper,
    codePage: config.codePage,
    columns: config.columns?.toString() ?? '',
    host: config.network?.host ?? '',
    port: config.network?.port.toString() ?? '9100',
    usbDevice: config.usbDevice ?? '',
    ticketLayout: config.ticketLayout,
    autoPrint: config.autoPrint,
  };
}

function PrinterProfile({
  config,
  editable,
  online,
}: {
  config: ThermalConfiguration;
  editable: boolean;
  online: boolean;
}): ReactElement {
  const { register, control, handleSubmit, reset, setError, formState } = useForm<PrinterForm>({
    defaultValues: defaults(config),
  });
  const [connection, paper, layout] = useWatch({
    control,
    name: ['connection', 'paper', 'ticketLayout'],
  });
  const receipt = config.destination === 'RECEIPT';
  const sampleAt = '2026-01-01T12:34:00.000Z';
  const sample =
    config.destination === 'RECEIPT'
      ? sampleThermalReceipt(layout, sampleAt)
      : sampleThermalTicket(config.destination, layout, sampleAt);
  const update = useUpdateThermalSettings();
  const check = useCheckThermalConnection();
  const test = useThermalTestPrint();
  const { mutateAsync: checkPrinter } = check;
  const { mutateAsync: sendTest } = test;
  const { isDirty, errors } = formState;
  const pending = update.isPending || check.isPending || test.isPending;
  const ready = config.transports.includes(config.connection);

  useEffect(() => {
    reset(defaults(config));
  }, [config, reset]);

  async function save(values: PrinterForm): Promise<void> {
    const settings = thermalSettingsSchema.safeParse({
      connection: values.connection,
      paper: values.paper,
      codePage: values.codePage,
      columns: values.columns === '' ? null : Number(values.columns),
      network: values.host.trim() ? { host: values.host, port: Number(values.port) } : null,
      usbDevice: values.usbDevice.trim() || null,
      ticketLayout: values.ticketLayout,
      autoPrint: values.autoPrint,
    });

    if (!settings.success) {
      for (const issue of settings.error.issues) {
        if (issue.path[0] === 'usbDevice') setError('usbDevice', { message: issue.message });
        if (issue.path[0] === 'columns') {
          setError('columns', { message: 'Enter a whole number from 16 to 72.' });
        }
        if (issue.path[1] === 'host') {
          setError('host', { message: issue.message });
        }
        if (issue.path[1] === 'port') {
          setError('port', { message: 'Enter a whole number from 1 to 65535.' });
        }
      }
      return;
    }

    check.reset();
    try {
      const saved = await update.mutateAsync({
        destination: config.destination,
        settings: settings.data,
      });
      reset(defaults(saved));
    } catch {
      // The request hook reports the save failure.
    }
  }

  const checkInput = { destination: config.destination, transport: config.connection };

  async function diagnose(action: 'check' | 'test'): Promise<void> {
    try {
      if (action === 'check') await checkPrinter(checkInput);
      else await sendTest({ ...checkInput, paper: config.paper });
    } catch {
      // The request hook reports the printer or connector failure.
    }
  }
  return (
    <form className="space-y-5" onSubmit={handleSubmit(save)} noValidate>
      <div className="rounded-md bg-muted px-3 py-2.5 text-sm" role="status">
        <p className="font-medium">{ready ? 'Connection configured' : 'Connection setup needed'}</p>
        <p className="text-muted-foreground">
          {config.connection === 'usb'
            ? (config.usbDevice ?? 'Enter the printer device path on the restaurant computer.')
            : config.network
              ? [config.network.host, config.network.port].join(':')
              : 'Enter an IPv4 address for your printer.'}
        </p>
        {!isDirty && check.isSuccess && <p>{check.data.message}</p>}
        {!isDirty && check.isError && <p className="text-destructive">Connection check failed.</p>}
      </div>

      <fieldset disabled={!editable || pending} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Connection</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {connections.map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  className="peer sr-only"
                  value={value}
                  {...register('connection')}
                />
                <span className="block cursor-pointer rounded-md border px-3 py-2 text-center text-sm peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-default">
                  {connectionNames[value]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {connection === 'network' && (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <label className="block space-y-1 text-sm">
                <span className="block font-medium">Printer IPv4 address</span>
                <Input
                  {...register('host')}
                  inputMode="decimal"
                  placeholder="192.168.1.50"
                  aria-invalid={!!errors.host}
                />
                {errors.host && (
                  <span className="block text-destructive">{errors.host.message}</span>
                )}
              </label>
              <label className="block space-y-1 text-sm">
                <span className="block font-medium">TCP port</span>
                <Input
                  {...register('port')}
                  inputMode="numeric"
                  placeholder="9100"
                  aria-invalid={!!errors.port}
                />
                {errors.port && (
                  <span className="block text-destructive">{errors.port.message}</span>
                )}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the printer’s private LAN address as seen from the restaurant computer.
            </p>
          </div>
        )}

        {connection === 'usb' && (
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">USB printer device</span>
            <Input
              {...register('usbDevice')}
              placeholder="/dev/usb/lp0"
              aria-invalid={Boolean(errors.usbDevice)}
            />
            {errors.usbDevice && (
              <span className="block text-destructive">{errors.usbDevice.message}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              Use the Linux printer device path on the computer running the connector.
            </span>
          </label>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Paper width</legend>
          <div className="grid grid-cols-2 gap-2">
            {widths.map((value) => (
              <label key={value} className="relative">
                <input type="radio" className="peer sr-only" value={value} {...register('paper')} />
                <span className="block cursor-pointer rounded-md border px-3 py-2 text-center text-sm peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-default">
                  {value} mm
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">Character set</span>
            <NativeSelect className="w-full" {...register('codePage')}>
              <NativeSelectOption value="ASCII">ASCII</NativeSelectOption>
              <NativeSelectOption value="CP437">CP437</NativeSelectOption>
              <NativeSelectOption value="CP858">CP858 (Western European and €)</NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">Characters per line</span>
            <Input
              {...register('columns')}
              inputMode="numeric"
              placeholder={paper === '58' ? '32 (default)' : '48 (default)'}
              aria-invalid={!!errors.columns}
            />
            {errors.columns && (
              <span className="block text-destructive">{errors.columns.message}</span>
            )}
          </label>
        </div>
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="block font-medium">
                {receipt ? 'Receipt layout' : 'Ticket layout'}
              </span>
              <NativeSelect className="w-full" {...register('ticketLayout')}>
                <NativeSelectOption value="STANDARD">Standard</NativeSelectOption>
                <NativeSelectOption value="COMPACT">Compact</NativeSelectOption>
                <NativeSelectOption value="DETAILED">Detailed</NativeSelectOption>
              </NativeSelect>
            </label>
            {!receipt && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" {...register('autoPrint')} />
                <span>
                  <span className="block font-medium">Print on send</span>
                  <span className="block text-muted-foreground">
                    Print new tickets through the connector when staff send an order or approve a QR
                    order.
                  </span>
                </span>
              </label>
            )}
          </div>
          <article
            className={printStyles.document}
            data-paper={paper}
            aria-label={receipt ? 'Sample receipt preview' : 'Sample ticket preview'}
          >
            <h3 className="font-bold">{sample.title}</h3>
            {sample.lines.map((line, index) => (
              <p key={index}>{line || '\u00a0'}</p>
            ))}
          </article>
        </div>
      </fieldset>

      {editable && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="submit" disabled={!isDirty || pending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDirty || pending || !ready || !online}
            onClick={() => void diagnose('check')}
          >
            {check.isPending ? 'Checking…' : 'Check connection'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDirty || pending || !ready || !online}
            onClick={() => void diagnose('test')}
          >
            {test.isPending ? 'Sending…' : 'Send test print'}
          </Button>
        </div>
      )}
    </form>
  );
}

export default function PrinterSettings(): ReactElement {
  const { can } = usePermissions();
  const printers = useThermalPrinterStatus();
  const connector = usePrintConnectorStatus();
  const pair = usePairPrintConnector();
  const revoke = useRevokePrintConnector();
  const { mutateAsync: pairConnector } = pair;
  const { mutateAsync: revokeConnector } = revoke;
  const canManage = can(Permission.RESTAURANT_WRITE);

  async function changePairing(action: 'pair' | 'revoke'): Promise<void> {
    try {
      if (action === 'pair') await pairConnector();
      else {
        await revokeConnector();
        pair.reset();
      }
    } catch {
      // The request hook reports the connector failure.
    }
  }
  const [destination, setDestination] = useState<ThermalDestination>('RECEIPT');
  const config = printers.data?.find((printer) => printer.destination === destination);
  return (
    <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Printer className="size-5 text-primary" aria-hidden />
            Thermal printing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up direct ESC/POS printing for receipts, kitchen tickets, and bar tickets. Browser
            printing is available from any bill or ticket.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh printer settings"
          title="Refresh printer settings"
          disabled={printers.isFetching || connector.isFetching}
          onClick={() => void Promise.all([printers.refetch(), connector.refetch()])}
        >
          <RefreshCw aria-hidden />
        </Button>
      </header>
      <section className="space-y-3 rounded-md border p-4" aria-label="Restaurant print connector">
        <h2 className="font-semibold">Restaurant print connector</h2>
        <p role="status" className="text-sm text-muted-foreground">
          {connector.isError
            ? 'Couldn’t check the connector. Use Refresh to try again.'
            : connector.isPending
              ? 'Checking connector…'
              : connector.data.online
                ? 'Connected'
                : connector.data.paired
                  ? 'Offline. Start the connector and refresh this page.'
                  : 'Pair a computer at this restaurant for USB and network printing.'}
        </p>
        {canManage && (
          <>
            <div className="flex flex-wrap gap-2">
              <a
                className={buttonVariants({ variant: 'outline' })}
                href="/restro-print-connector.mjs"
                download
              >
                <Download aria-hidden /> Download connector
              </a>
              <Button
                type="button"
                variant="outline"
                disabled={pair.isPending || revoke.isPending}
                onClick={() => void changePairing('pair')}
              >
                {connector.data?.paired ? 'Replace pairing code' : 'Generate pairing code'}
              </Button>
              {connector.data?.paired && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pair.isPending || revoke.isPending}
                  onClick={() => void changePairing('revoke')}
                >
                  Revoke pairing
                </Button>
              )}
            </div>
            {connector.data?.paired && !pair.data && (
              <p className="text-xs text-muted-foreground">
                Replacing or revoking a pairing disconnects the current connector.
              </p>
            )}
            {pair.data && (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <p>Run this command on the restaurant computer with Node.js 20 or later.</p>
                <code className="block break-all">{connectorCommand}</code>
                <p>
                  Paste this pairing code at the prompt. It grants access to this restaurant’s print
                  jobs.
                </p>
                <code className="block break-all">{pair.data.token}</code>
                <Button type="button" variant="ghost" size="sm" onClick={() => pair.reset()}>
                  Hide pairing code
                </Button>
              </div>
            )}
          </>
        )}
      </section>
      {printers.isPending && <p role="status">Loading printer settings…</p>}
      {printers.isError && (
        <p role="alert">Couldn’t load printer settings. Use Refresh to try again.</p>
      )}
      {config && (
        <>
          <div
            aria-label="Printer destination"
            role="group"
            className="flex flex-wrap gap-2 border-b pb-3"
          >
            {printers.data?.map((printer) => (
              <Button
                key={printer.destination}
                type="button"
                variant={destination === printer.destination ? 'secondary' : 'ghost'}
                aria-pressed={destination === printer.destination}
                onClick={() => setDestination(printer.destination)}
              >
                {names[printer.destination]}
              </Button>
            ))}
          </div>
          <PrinterProfile
            key={destination}
            config={config}
            editable={canManage}
            online={connector.data?.online === true}
          />
        </>
      )}
    </section>
  );
}
