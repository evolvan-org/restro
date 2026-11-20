import { redirect } from 'next/navigation';

/** Table statuses setup is consolidated into restaurant settings. */
export default function TableStatusesRedirect(): never {
  redirect('/restaurant/settings/table-statuses');
}
