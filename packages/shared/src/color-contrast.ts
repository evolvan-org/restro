/** WCAG 2.x contrast helpers (framework-agnostic). */

const HEX_COLOR = /^#([0-9a-f]{6})$/i;

/** Relative luminance of an `#RRGGBB` colour, or null when the input is not a 6-digit hex. */
export function relativeLuminance(hex: string): number | null {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two `#RRGGBB` colours (1–21), or null if either is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;

/** True when white text on `hex` meets WCAG AA (4.5:1). */
export function isReadableWithWhite(hex: string): boolean {
  const ratio = contrastRatio(hex, '#FFFFFF');
  return ratio !== null && ratio >= MIN_TEXT_CONTRAST;
}

/** The brand colour when white text on it meets AA, otherwise the fallback. */
export function readableBrandColor(hex: string | null | undefined, fallback: string): string {
  return hex && isReadableWithWhite(hex) ? hex.toUpperCase() : fallback;
}
