'use client';

import QRCode from 'qrcode';

import { guestOrderUrl } from '@/lib/qr';

/** One face of the A6 tent card (A2), 148 × 105 mm, drawn at 8 px/mm (~203 dpi). */
export const FACE_MM = { width: 148, height: 105 } as const;
const PX_PER_MM = 8;
const W = FACE_MM.width * PX_PER_MM;
const H = FACE_MM.height * PX_PER_MM;

export type CardBrand = { name: string; initials: string; brandColor: string };

const DISPLAY_FONT = 'Fraunces, Georgia, "Times New Roman", serif';
const BODY_FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  font: (size: number) => string,
): number {
  let size = start;
  ctx.font = font(size);
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * Draws a card face: brand panel (logo mark, name, TABLE n) and the QR with "Scan to order". The
 * captain is never printed, so cards stay valid when staff change.
 */
export async function renderFace(input: {
  brand: CardBrand;
  tableNumber: string;
  token: string;
  origin: string;
}): Promise<HTMLCanvasElement> {
  const { brand, tableNumber } = input;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  const s = W / 559; // design units → px

  ctx.fillStyle = '#FFF8EF';
  ctx.fillRect(0, 0, W, H);
  const panel = 190 * s;
  ctx.fillStyle = brand.brandColor;
  ctx.fillRect(0, 0, panel, H);

  // Logo mark
  const pad = 22 * s;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pad + 28 * s, 28 * s + 28 * s, 28 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = brand.brandColor;
  ctx.font = `700 ${22 * s}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand.initials, pad + 28 * s, 56 * s);

  // Restaurant name
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${24 * s}px ${DISPLAY_FONT}`;
  wrap(ctx, brand.name, panel - pad * 2).forEach((line, index) => {
    ctx.fillText(line, pad, 96 * s + index * 27 * s);
  });

  // TABLE n
  ctx.font = `700 ${13 * s}px ${BODY_FONT}`;
  ctx.fillText('T A B L E', pad, H - 28 * s - 92 * s - 18 * s);
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, tableNumber, panel - pad * 2, 96 * s, (size) => `700 ${size}px ${DISPLAY_FONT}`);
  ctx.fillText(tableNumber, pad, H - 28 * s);

  // QR
  const qrSize = 168 * s;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, guestOrderUrl(input.token, input.origin), {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#2B1A12', light: '#FFFFFF' },
  });
  const centreX = panel + (W - panel) / 2;
  const boxPad = 14 * s;
  const boxSize = qrSize + boxPad * 2;
  const boxX = centreX - boxSize / 2;
  const boxY = 58 * s;
  ctx.fillStyle = brand.brandColor;
  roundRect(ctx, boxX - 3 * s, boxY - 3 * s, boxSize + 6 * s, boxSize + 6 * s, 21 * s);
  ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(ctx, boxX, boxY, boxSize, boxSize, 18 * s);
  ctx.fill();
  ctx.drawImage(qrCanvas, boxX + boxPad, boxY + boxPad, qrSize, qrSize);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#2B1A12';
  ctx.font = `700 ${30 * s}px ${DISPLAY_FONT}`;
  ctx.fillText('Scan to order', centreX, boxY + boxSize + 14 * s);
  ctx.fillStyle = '#66554A';
  ctx.font = `500 ${14 * s}px ${BODY_FONT}`;
  ctx.fillText('No app. No login. Pay by UPI at the end.', centreX, boxY + boxSize + 54 * s);
  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The same face turned 180° (top half of the tent, readable from the other side of the fold). */
export function rotated(face: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = face.width;
  canvas.height = face.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return face;
  ctx.translate(face.width, face.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(face, 0, 0);
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/** All tables as A6 tent cards: one A5 sheet per table, top face rotated, fold line marked. */
export async function downloadTentPdf(
  faces: { tableNumber: string; face: HTMLCanvasElement }[],
  filename: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    unit: 'mm',
    format: [FACE_MM.width, FACE_MM.height * 2],
    orientation: 'portrait',
  });
  faces.forEach(({ face }, index) => {
    if (index > 0) pdf.addPage([FACE_MM.width, FACE_MM.height * 2], 'portrait');
    pdf.addImage(rotated(face).toDataURL('image/png'), 'PNG', 0, 0, FACE_MM.width, FACE_MM.height);
    pdf.addImage(
      face.toDataURL('image/png'),
      'PNG',
      0,
      FACE_MM.height,
      FACE_MM.width,
      FACE_MM.height,
    );
    pdf.setLineDashPattern([2, 1.5], 0);
    pdf.setDrawColor(138, 125, 112);
    pdf.setLineWidth(0.3);
    pdf.line(0, FACE_MM.height, FACE_MM.width, FACE_MM.height);
    pdf.setFontSize(5);
    pdf.setTextColor(102, 85, 74);
    pdf.text(
      'FOLD HERE · A6 TENT CARD · 148 × 105 MM PER FACE',
      FACE_MM.width / 2,
      FACE_MM.height - 1,
      { align: 'center' },
    );
  });
  pdf.save(filename);
}
