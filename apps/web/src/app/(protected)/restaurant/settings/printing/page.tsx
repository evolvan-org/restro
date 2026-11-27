'use client';

import {
  type ThermalConfiguration,
  type ThermalDestination,
  type ThermalSettings,
  thermalSettingsSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Printer, RefreshCw } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useCheckThermalConnection,
  useThermalPrinterStatus,
  useThermalTestPrint,
  useUpdateThermalSettings,
} from '@/services/api/requests/thermal-printing';

const names = { RECEIPT: 'Receipts', KITCHEN: 'Kitchen tickets', BAR: 'Bar tickets' };
const connectionNames = { usb: 'USB on the API host', network: 'Network printer' };
const connections = ['usb', 'network'] as const;
const widths = ['58', '80'] as const;

type PrinterForm = Omit<ThermalSettings, 'network' | 'columns'> & {
  host: string;
  port: string;
  columns: string;
};

function defaults(config: ThermalConfiguration): PrinterForm {
  return {
    connection: config.connection,
    paper: config.paper,
    codePage: config.codePage,
    columns: config.columns?.toString() ?? '',
    host: config.network?.host ?? '',
    port: config.network?.port.toString() ?? '9100',
  };
}

function PrinterProfile({
  config,
  editable,
}: {
  config: ThermalConfiguration;
  editable: boolean;
}): ReactElement {
  const { register, control, handleSubmit, reset, setError, formState } = useForm<PrinterForm>({
    defaultValues: defaults(config),
  });
  const [connection, paper] = useWatch({ control, name: ['connection', 'paper'] });
  const update = useUpdateThermalSettings();
  const check = useCheckThermalConnection();
  const test = useThermalTestPrint();
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
    });

    if (!settings.success) {
      for (const issue of settings.error.issues) {
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
  return (
    <form className="space-y-5" onSubmit={handleSubmit(save)} noValidate>
      <div className="rounded-md bg-muted px-3 py-2.5 text-sm" role="status">
        <p className="font-medium">{ready ? 'Connection configured' : 'Connection setup needed'}</p>
        <p className="text-muted-foreground">
          {config.connection === 'usb'
            ? (config.usbDevice ?? 'Set a USB printer device on the Restro API host.')
            : config.network
              ? [config.network.host, config.network.port].join(':')
              : 'Enter an IPv4 address for your printer.'}
          {config.connection === 'network' &&
            config.network &&
            !ready &&
            ' The API host must allow this endpoint before it can connect.'}
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
              {config.hasApprovedNetworkTargets
                ? 'The API host must allow the exact address and port. Clear the address to remove it.'
                : 'You can save an endpoint now. An administrator must enable network printing on the API host and allow the endpoint.'}
            </p>
          </div>
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
      </fieldset>

      {editable && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="submit" disabled={!isDirty || pending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDirty || pending || !ready}
            onClick={() => check.mutate(checkInput)}
          >
            {check.isPending ? 'Checking…' : 'Check connection'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDirty || pending || !ready}
            onClick={() => test.mutate({ ...checkInput, paper: config.paper })}
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
          disabled={printers.isFetching}
          onClick={() => void printers.refetch()}
        >
          <RefreshCw aria-hidden />
        </Button>
      </header>
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
            editable={can(Permission.RESTAURANT_WRITE)}
          />
        </>
      )}
    </section>
  );
}
