import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import CancellationReasonsClient from './CancellationReasonsClient';

export const metadata: Metadata = {
  title: 'Cancellation Reasons | Restaurant Management System',
  description: 'Manage authorized reasons for bill and item cancellations.',
};

export default function CancellationReasonsSettingsPage(): ReactElement {
  return <CancellationReasonsClient />;
}
