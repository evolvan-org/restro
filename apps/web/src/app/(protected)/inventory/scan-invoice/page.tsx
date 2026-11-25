import type { Metadata } from 'next';

import InvoiceReceipt from '@/containers/AiImport/InvoiceReceipt';

export const metadata: Metadata = {
  title: 'Scan supplier invoice | Restaurant Management System',
  description: 'Read a supplier invoice from photos into a goods receipt.',
};

export default InvoiceReceipt;
