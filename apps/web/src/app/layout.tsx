import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppProvider from '@/providers';
import AppLayout from '@/components/AppLayout';
import './globals.css';

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
