import type { Metadata, Viewport } from 'next';
import { DM_Sans, Fraunces, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-guest-body',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-guest-display',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-guest-ui',
});

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
 * Public guest QR ordering. Lives outside `(protected)`: no staff shell, no auth. Guest type is
 * DM Sans (body) and Fraunces (display), self-hosted by next/font.
 */
export default function GuestLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={`${dmSans.variable} ${fraunces.variable} ${inter.variable}`}>{children}</div>
  );
}
