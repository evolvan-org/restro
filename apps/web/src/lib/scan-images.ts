/*
 * Browser-side photo preparation for scans: HEIC → JPEG, PDF → one JPEG per page, downscale to a
 * 2000 px long edge, and a quick quality check (sharpness, brightness, size) BEFORE anything is
 * uploaded, so a blurry photo is caught while the owner can still retake it.
 */

export const SCAN_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;
/** Laplacian variance on a 512 px grey copy; below this, text is usually too soft to read. */
const BLUR_THRESHOLD = 60;
const DARK_THRESHOLD = 60;
const MIN_SHORT_EDGE = 700;

export type PageWarning = 'blurry' | 'dark' | 'small';

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
  blurry: 'Looks blurry. Hold the phone steady, or retake in better light.',
  dark: 'Looks dark. Retake near a window or with the lights on.',
  small: 'Low resolution. Move closer so the page fills the frame.',
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
}

function quality(canvas: HTMLCanvasElement): { sharpness: number; brightness: number } {
  const size = 512;
  const scale = size / Math.max(canvas.width, canvas.height);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const context = small.getContext('2d', { willReadFrequently: true });
  if (!context) return { sharpness: 999, brightness: 128 };
  context.drawImage(canvas, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  const grey = new Float32Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i += 1) {
    const value = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    grey[i] = value;
    total += value;
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  const mean = count ? sum / count : 0;
  return {
    sharpness: count ? sumSq / count - mean * mean : 999,
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
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare photos');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  const { sharpness, brightness } = quality(canvas);
  const blob = await canvasToBlob(canvas);
  const warnings: PageWarning[] = [];
  if (sharpness < BLUR_THRESHOLD) warnings.push('blurry');
  if (brightness < DARK_THRESHOLD) warnings.push('dark');
  if (Math.min(width, height) < MIN_SHORT_EDGE) warnings.push('small');
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
