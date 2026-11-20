import { redirect } from 'next/navigation';

/** Staff setup is consolidated into restaurant settings. */
export default function StaffRedirect(): never {
  redirect('/restaurant/settings/team');
}
