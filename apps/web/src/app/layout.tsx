import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import AppLayout from '@/components/AppLayout';
import AppProvider from '@/providers';

export const metadata: Metadata = {
  title: 'Restaurant Management System',
  description: 'Modern, scalable restaurant management platform.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <AppLayout>{children}</AppLayout>
        </AppProvider>
      </body>
    </html>
  );
}
