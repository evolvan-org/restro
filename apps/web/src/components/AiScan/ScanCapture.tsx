'use client';

import { SCAN_MAX_PAGES } from '@rms/api-contract';
import { cn } from 'cn';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Eye,
  ImagePlus,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { type DragEvent, type ReactElement, useRef, useState } from 'react';

import { Alert, btn, Card } from '@/containers/Onboarding/ui/kit';
import {
  PAGE_WARNING_TEXT,
  prepareScanPages,
  releasePages,
  type ScanPage,
} from '@/lib/scan-images';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf';

/**
 * Capture tile + page thumbnail strip (board "Menu scan: capture"): drag and drop on desktop, the
 * camera on phones; reorder (drag or arrow buttons), delete and retake; blur / dark warnings before
 * anything is read. Controlled: the step's footer starts the read.
 */
export function ScanCapture({
  noun,
  pages,
  onPagesChange,
  error,
  inlineStart,
}: {
  /** "menu" or "invoice". */
  noun: string;
  pages: ScanPage[];
  onPagesChange: (pages: ScanPage[]) => void;
  error?: string;
  /** A start button inside the capture card (when the footer belongs to something else). */
  inlineStart?: { label: string; busy: boolean; onStart: () => void };
}): ReactElement {
  const [selected, setSelected] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const retakeRef = useRef<HTMLInputElement>(null);

  async function add(files: File[], replaceIndex?: number): Promise<void> {
    if (!files.length) return;
    setProblem(undefined);
    const room = replaceIndex === undefined ? SCAN_MAX_PAGES - pages.length : 1;
    if (room <= 0) {
      setProblem(`Up to ${SCAN_MAX_PAGES} pages per scan.`);
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareScanPages(files, room);
      if (replaceIndex === undefined) {
        onPagesChange([...pages, ...prepared]);
        setSelected(pages.length);
      } else {
        const next = [...pages];
        const old = next[replaceIndex];
        if (old) releasePages([old]);
        next.splice(replaceIndex, 1, ...prepared.slice(0, 1));
        onPagesChange(next);
      }
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'We could not open that file.');
    } finally {
      setPreparing(false);
    }
  }

  function move(from: number, to: number): void {
    if (to < 0 || to >= pages.length || from === to) return;
    const next = [...pages];
    const [page] = next.splice(from, 1);
    if (page) next.splice(to, 0, page);
    onPagesChange(next);
    setSelected(to);
  }

  function remove(index: number): void {
    const page = pages[index];
    if (page) releasePages([page]);
    onPagesChange(pages.filter((_, i) => i !== index));
    setSelected(Math.max(0, Math.min(selected, pages.length - 2)));
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    void add([...event.dataTransfer.files]);
  }

  const flagged = pages.filter((page) => page.warnings.length > 0);
  const hidden = (
    ref: React.RefObject<HTMLInputElement | null>,
    options: { multiple?: boolean; camera?: boolean; replace?: boolean },
  ) => (
    <input
      ref={ref}
      type="file"
      accept={options.camera ? 'image/*' : ACCEPT}
      multiple={options.multiple}
      {...(options.camera && { capture: 'environment' as const })}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        void add([...(event.target.files ?? [])], options.replace ? selected : undefined);
        event.target.value = '';
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-5 lg:flex-row">
        <div
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-[280px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center',
            dragging
              ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
              : 'border-zinc-300 bg-muted dark:border-zinc-700',
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-[14px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <Upload className="size-[26px]" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Drop {noun} photos here</h2>
          <p className="text-sm text-muted-foreground">
            or choose files. JPG, PNG, HEIC or PDF. Up to {SCAN_MAX_PAGES} pages.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" className={btn()} onClick={() => pickRef.current?.click()}>
              <ImagePlus aria-hidden />
              Choose photos
            </button>
            <button type="button" className={btn()} onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden />
              Use my phone camera
            </button>
          </div>
          {preparing && (
            <p role="status" className="text-[12.5px] text-muted-foreground">
              Preparing photos…
            </p>
          )}
          {hidden(pickRef, { multiple: true })}
          {hidden(cameraRef, { camera: true })}
          {hidden(retakeRef, { replace: true })}
        </div>
        <Card as="aside" className="w-full flex-none p-[18px] lg:w-[300px]">
          <h3 className="text-sm font-semibold">For a clean read</h3>
          <ul className="mt-3 flex flex-col gap-3 text-[13.5px] text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <Eye className="mt-0.5 size-4 flex-none" aria-hidden />
              Lay the {noun} flat, in daylight if you can.
            </li>
            <li className="flex items-start gap-2.5">
              <Layers className="mt-0.5 size-4 flex-none" aria-hidden />
              Fit the whole page in the frame, edges visible.
            </li>
            <li className="flex items-start gap-2.5">
              <BookOpen className="mt-0.5 size-4 flex-none" aria-hidden />
              {noun === 'menu'
                ? 'Hindi, regional scripts and mixed menus are fine.'
                : 'Printed, thermal and handwritten invoices are fine.'}
            </li>
          </ul>
        </Card>
      </div>

      {pages.length > 0 && (
        <Card as="section" className="px-4 py-3.5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'} added{' '}
              <span className="font-normal text-muted-foreground">· drag to reorder</span>
            </h3>
            <button
              type="button"
              className={btn('default', 'sm')}
              disabled={pages.length >= SCAN_MAX_PAGES}
              onClick={() => pickRef.current?.click()}
            >
              <Plus aria-hidden />
              Add page
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ol className="flex flex-wrap gap-3" aria-label="Pages">
              {pages.map((page, index) => (
                <li
                  key={page.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    aria-pressed={index === selected}
                    aria-label={`Page ${index + 1}${page.warnings.length ? ', may need a retake' : ''}`}
                    className={cn(
                      'relative block h-[84px] w-16 overflow-hidden rounded-md border border-zinc-300 bg-muted dark:border-zinc-700',
                      index === selected && 'outline-2 outline-offset-2 outline-foreground',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.url} alt="" className="size-full object-cover" />
                    <b className="absolute bottom-1 left-1 rounded bg-black/70 px-[5px] text-[11px] text-white">
                      {index + 1}
                    </b>
                    {page.warnings.length > 0 && (
                      <span className="absolute top-1 right-1 flex size-[18px] items-center justify-center rounded bg-red-700 text-white">
                        <TriangleAlert className="size-3" aria-hidden />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            {pages.length < SCAN_MAX_PAGES && (
              <button
                type="button"
                onClick={() => pickRef.current?.click()}
                aria-label="Add a page"
                className="flex h-[84px] w-16 items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-muted text-muted-foreground dark:border-zinc-700"
              >
                <Plus className="size-[18px]" aria-hidden />
              </button>
            )}
            <span className="flex-1" />
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btn('default', 'sm')}
                disabled={selected === 0}
                onClick={() => move(selected, selected - 1)}
                aria-label="Move page earlier"
              >
                <ArrowLeft aria-hidden />
              </button>
              <button
                type="button"
                className={btn('default', 'sm')}
                disabled={selected >= pages.length - 1}
                onClick={() => move(selected, selected + 1)}
                aria-label="Move page later"
              >
                <ArrowRight aria-hidden />
              </button>
              <button
                type="button"
                className={btn('default', 'sm')}
                onClick={() => retakeRef.current?.click()}
              >
                <RotateCcw aria-hidden />
                Retake
              </button>
              <button
                type="button"
                className={btn('default', 'sm')}
                onClick={() => remove(selected)}
              >
                <Trash2 aria-hidden />
                Delete
              </button>
            </span>
          </div>
          {flagged.length > 0 && (
            <Alert tone="warn" role="status" icon={<TriangleAlert aria-hidden />} className="mt-3">
              {flagged.map((page) => (
                <p key={page.id}>
                  <b>Page {pages.indexOf(page) + 1}:</b>{' '}
                  {page.warnings.map((warning) => PAGE_WARNING_TEXT[warning]).join(' ')}
                </p>
              ))}
              <p className="mt-1 text-xs">
                You can still read them; anything unclear is flagged for checking.
              </p>
            </Alert>
          )}
        </Card>
      )}

      {(problem || error) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {problem ?? error}
        </p>
      )}

      {inlineStart && (
        <div className="flex justify-end">
          <button
            type="button"
            className={btn('ai')}
            disabled={pages.length === 0 || inlineStart.busy || preparing}
            onClick={inlineStart.onStart}
          >
            <Sparkles aria-hidden />
            {inlineStart.busy ? 'Uploading…' : inlineStart.label}
          </button>
        </div>
      )}
    </div>
  );
}
