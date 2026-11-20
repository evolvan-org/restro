import { redirect } from 'next/navigation';

/** Tables setup is consolidated into restaurant settings. */
export default function TablesRedirect(): never {
  redirect('/restaurant/settings/tables');
}
