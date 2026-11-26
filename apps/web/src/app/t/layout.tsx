import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Order at your table',
  description: 'Browse the menu, order and pay from your phone.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFF8EF',
};

/**
 * The guest type families (DM Sans body, Fraunces display, Inter for status pills). The font
 * files ship with the app (@fontsource), so neither the build nor the guest's phone depends on
 * Google Fonts being reachable.
 */
const fontVariables = {
  '--font-guest-body': "'DM Sans'",
  '--font-guest-display': "'Fraunces'",
  '--font-guest-ui': "'Inter'",
} as CSSProperties;

/**
 * Public guest QR ordering. Lives outside `(protected)`: no staff shell, no auth.
 */
export default function GuestLayout({ children }: { children: ReactNode }): ReactNode {
  return <div style={fontVariables}>{children}</div>;
}
