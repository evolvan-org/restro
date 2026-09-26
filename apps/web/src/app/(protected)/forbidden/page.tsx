import type { Metadata } from 'next';

import Forbidden from '@/containers/Forbidden';

export const metadata: Metadata = {
  title: 'Access Denied | Restaurant Management System',
  description: 'You do not have permission to view this page.',
};

export default Forbidden;
