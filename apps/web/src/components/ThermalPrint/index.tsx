'use client';

import type { Kot, ThermalKind, ThermalPrintRequest } from '@rms/api-contract';
import { Printer } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  useDirectThermalPrint,
  useThermalDocument,
} from '@/services/api/requests/thermal-printing';

import styles from './thermal.module.css';

type PrintSettings = { paper: ThermalPrintRequest['paper']; copy: boolean };

export default function ThermalPrint({
  id,
  kind,
  printStatus,
}: {
  id: string;
  kind: ThermalKind;
  printStatus?: Kot['printStatus'];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const { register, control, setValue } = useForm<PrintSettings>({
    defaultValues: { paper: '80', copy: false },
  });
  const paper = useWatch({ control, name: 'paper' });
  const copy = useWatch({ control, name: 'copy' });
  const documentQuery = useThermalDocument(kind, id, open);
  const { mutateAsync: sendToPrinter, isPending } = useDirectThermalPrint(kind, id);
  const printDocument = documentQuery.data;
  const queued = printStatus === 'QUEUED' || printStatus === 'PRINTING';

  const savedPaper = printDocument?.profile.paper;

  useEffect(() => {
    if (open && savedPaper) setValue('paper', savedPaper);
  }, [open, savedPaper, setValue]);

  function browserPrint(): void {
    if (!printDocument) return;
    const frame = document.createElement('iframe');
    frame.title = 'Thermal print document';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;border:0';
    document.body.append(frame);
    const page = frame.contentDocument;
    const printer = frame.contentWindow;
    if (!page || !printer) {
      frame.remove();
      return;
    }
    page.title = printDocument.title;
    const style = page.createElement('style');
    const width = paper === '58' ? '54mm' : '76mm';
    style.textContent =
      '@page { margin: 0 } body { box-sizing: border-box; width: ' +
      width +
      '; margin: 0; padding: 3mm; font: 11px/1.4 monospace; overflow-wrap: anywhere; white-space: pre-wrap; } ' +
      'h1, p { margin: 0; } h1 { font-size: 14px; } p { break-inside: avoid; }';
    page.head.append(style);
    const heading = page.createElement('h1');
    heading.textContent = printDocument.title;
    page.body.append(heading);
    for (const line of [...(copy ? ['COPY'] : []), ...printDocument.lines]) {
      const row = page.createElement('p');
      row.textContent = line || '\u00a0';
      page.body.append(row);
    }
    printer.addEventListener('afterprint', () => frame.remove(), { once: true });
    printer.focus();
    printer.print();
  }

  async function direct(transport: ThermalPrintRequest['transport']): Promise<void> {
    try {
      await sendToPrinter({ transport, paper, copy });
    } catch {
      /* Shared request feedback owns the error. */
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Printer aria-hidden />
            {printStatus === 'UNCONFIRMED' ? 'Retry thermal print' : 'Thermal print'}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thermal {kind === 'receipt' ? 'receipt' : 'ticket'}</DialogTitle>
          <DialogDescription>Choose a paper width and print connection.</DialogDescription>
        </DialogHeader>
        {documentQuery.isPending && <p role="status">Loading print preview…</p>}
        {documentQuery.isError && (
          <Button variant="outline" onClick={() => void documentQuery.refetch()}>
            Retry print preview
          </Button>
        )}
        {printDocument && !documentQuery.isError && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span className="block">Paper width</span>
                <NativeSelect {...register('paper')}>
                  <NativeSelectOption value="58">58 mm</NativeSelectOption>
                  <NativeSelectOption value="80">80 mm</NativeSelectOption>
                </NativeSelect>
              </label>
              <label className="flex items-center gap-2 py-2 text-sm">
                <input type="checkbox" {...register('copy')} />
                Mark as copy
              </label>
            </div>
            <article className={styles.document} data-paper={paper} aria-label="Print preview">
              <h3 className="font-bold">{printDocument.title}</h3>
              {copy && <p className="font-bold">COPY</p>}
              {printDocument.lines.map((line, index) => (
                <p key={index}>{line || '\u00a0'}</p>
              ))}
            </article>
            {printStatus === 'UNCONFIRMED' && (
              <p className="text-sm text-muted-foreground">
                Check the printer before retrying. The previous copy may have printed.
              </p>
            )}
            {queued && (
              <p role="status" className="text-sm">
                This ticket already has a print in progress.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={browserPrint} disabled={isPending || queued}>
                Print from browser
              </Button>
              <Button
                variant="outline"
                onClick={() => void direct('network')}
                disabled={isPending || queued || !printDocument.transport.includes('network')}
              >
                Network printer
              </Button>
              <Button
                variant="outline"
                onClick={() => void direct('usb')}
                disabled={isPending || queued || !printDocument.transport.includes('usb')}
              >
                USB printer
              </Button>
            </div>
            {printDocument.transport.length < 2 && (
              <p className="text-xs text-muted-foreground">
                Direct printing uses the restaurant’s print connector and saved printer settings.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
