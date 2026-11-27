/*
 * Browser-side photo preparation for scans: HEIC → JPEG, PDF → one JPEG per page, downscale to a
 * 2000 px long edge, and a quick quality check (resolution, text sharpness, brightness) BEFORE
 * anything is uploaded. Only hopeless photos (thumbnails, extreme blur) are refused here; small,
 * soft or dark ones are sent with a warning, since readability depends on text size, not image
 * size. The model judges them, re-reading a poor page at extra detail once.
 */

import { SCAN_MIN_SHORT_EDGE } from '@rms/api-contract';

export const SCAN_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;
/*
 * Text sharpness (see `measure`), calibrated on a printed menu: sharp photos score 600+, slight
 * camera softness ~600–800, a 2 px blur ~50 (prices risky), a 3 px blur ~12 (unreadable).
 */
/** Below this, nothing on the page can be read: refused. */
const UNREADABLE_BLUR = 20;
/** Below this, prices may be misread: sent with a warning. */
const SOFT_BLUR = 100;
/** Short edges below this get a "small photo" warning (above the hard minimum). */
const SMALL_SHORT_EDGE = 500;
const DARK_THRESHOLD = 60;
const SHARPNESS_TILE = 64;

export type PageWarning = 'too-blurry' | 'too-small' | 'blurry' | 'dark' | 'small';

/** Hopeless photos: refused until retaken or removed. Every other warning is advice only. */
export const BLOCKING_WARNINGS: readonly PageWarning[] = ['too-blurry', 'too-small'];

export type ScanPage = {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  sharpness: number;
  warnings: PageWarning[];
  source: string;
};

export const PAGE_WARNING_TEXT: Record<PageWarning, string> = {
  'too-blurry': 'Too blurry to read anything. Hold the phone steady and retake it in good light.',
  'too-small':
    'Too small to read. Use the original photo rather than a thumbnail, or retake it closer.',
  blurry: 'Looks a little soft, so some prices may be misread. A steadier photo reads best.',
  dark: 'Looks dark. Retake near a window or with the lights on.',
  small: 'Small photo. Fine if the text is large; otherwise retake it closer.',
};

export function isPageBlocked(page: Pick<ScanPage, 'warnings'>): boolean {
  return page.warnings.some((warning) => BLOCKING_WARNINGS.includes(warning));
}

/** Readable reason a page can't be sent, or null when it can. */
export function pageBlockReason(page: Pick<ScanPage, 'warnings'>): string | null {
  const blocking = page.warnings.filter((warning) => BLOCKING_WARNINGS.includes(warning));
  return blocking.length ? blocking.map((warning) => PAGE_WARNING_TEXT[warning]).join(' ') : null;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
}

/**
 * Sharpness of the page's text, not the page: Laplacian variance per 64 px tile at upload
 * resolution (what the model sees), averaged over the most detailed 10% of tiles. Blank margins
 * and plain backgrounds don't drag a sharp menu down, and a blurry one can't hide behind them.
 */
function measure(canvas: HTMLCanvasElement): { sharpness: number; brightness: number } {
  const { width: w, height: h } = canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || w < 3 || h < 3) return { sharpness: 999, brightness: 128 };
  const { data } = context.getImageData(0, 0, w, h);
  const grey = new Float32Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i += 1) {
    const value = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    grey[i] = value;
    total += value;
  }
  const tile = SHARPNESS_TILE;
  const variances: number[] = [];
  for (let top = 0; top < h; top += tile) {
    for (let left = 0; left < w; left += tile) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let y = Math.max(1, top); y < Math.min(h - 1, top + tile); y += 1) {
        for (let x = Math.max(1, left); x < Math.min(w - 1, left + tile); x += 1) {
          const i = y * w + x;
          const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
          sum += lap;
          sumSq += lap * lap;
          count += 1;
        }
      }
      if (count > tile) variances.push(sumSq / count - (sum / count) ** 2);
    }
  }
  variances.sort((a, b) => b - a);
  const top = variances.slice(0, Math.max(1, Math.ceil(variances.length * 0.1)));
  return {
    sharpness: top.length ? top.reduce((a, b) => a + b, 0) / top.length : 999,
    brightness: total / (w * h),
  };
}

async function fromDrawable(
  drawable: CanvasImageSource,
  width: number,
  height: number,
  source: string,
): Promise<ScanPage> {
  const scale = Math.min(1, SCAN_LONG_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot prepare photos');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  const { sharpness, brightness } = measure(canvas);
  const blob = await canvasToBlob(canvas);
  const warnings: PageWarning[] = [];
  if (sharpness < UNREADABLE_BLUR) warnings.push('too-blurry');
  else if (sharpness < SOFT_BLUR) warnings.push('blurry');
  if (brightness < DARK_THRESHOLD) warnings.push('dark');
  // The uploaded size, which is what the API checks too.
  const shortEdge = Math.min(canvas.width, canvas.height);
  if (shortEdge < SCAN_MIN_SHORT_EDGE) warnings.push('too-small');
  else if (shortEdge < SMALL_SHORT_EDGE) warnings.push('small');
  return {
    id: crypto.randomUUID(),
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    sharpness: Math.round(sharpness),
    warnings,
    source,
  };
}

async function imageFile(file: Blob, name: string): Promise<ScanPage> {
  const bitmap = await createImageBitmap(file);
  try {
    return await fromDrawable(bitmap, bitmap.width, bitmap.height, name);
  } finally {
    bitmap.close();
  }
}

async function heicFile(file: File): Promise<ScanPage> {
  try {
    // Safari decodes HEIC natively; other browsers need the converter.
    return await imageFile(file, file.name);
  } catch {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    return imageFile(Array.isArray(converted) ? converted[0]! : converted, file.name);
  }
}

async function pdfFile(file: File, maxPages: number): Promise<ScanPage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const document_ = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: ScanPage[] = [];
  for (let index = 1; index <= Math.min(document_.numPages, maxPages); index += 1) {
    const page = await document_.getPage(index);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: SCAN_LONG_EDGE / Math.max(base.width, base.height),
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) break;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(await fromDrawable(canvas, canvas.width, canvas.height, `${file.name} p${index}`));
  }
  return pages;
}

const isHeic = (file: File): boolean =>
  /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
const isPdf = (file: File): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Turns picked files into upload-ready pages (at most `maxPages`). Throws a readable message. */
export async function prepareScanPages(
  files: readonly File[],
  maxPages: number,
): Promise<ScanPage[]> {
  const pages: ScanPage[] = [];
  for (const file of files) {
    if (pages.length >= maxPages) break;
    try {
      if (isPdf(file)) pages.push(...(await pdfFile(file, maxPages - pages.length)));
      else if (isHeic(file)) pages.push(await heicFile(file));
      else if (file.type.startsWith('image/')) pages.push(await imageFile(file, file.name));
      else throw new Error('unsupported');
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message === 'unsupported'
          ? `${file.name} isn't a photo or PDF. Use JPG, PNG, HEIC or PDF.`
          : `We couldn't open ${file.name}. Try another photo.`,
      );
    }
  }
  return pages.slice(0, maxPages);
}

export function releasePages(pages: readonly ScanPage[]): void {
  for (const page of pages) URL.revokeObjectURL(page.url);
}
