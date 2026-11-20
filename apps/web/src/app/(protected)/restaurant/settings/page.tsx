import type { Metadata } from 'next';
import type { ReactElement } from 'react';

export const metadata: Metadata = {
  title: 'Restaurant Settings | Restaurant Management System',
  description: "View and update your restaurant's settings.",
};

/**
 * Empty placeholder page for the tabbed restaurant settings consolidation (REST-78).
 * To be built out by the user.
 */
export default function RestaurantSettingsPage(): ReactElement {
  return (
    <div className="flex flex-1 flex-col p-6">{/* Empty page for now, to be filled later */}</div>
  );
}
