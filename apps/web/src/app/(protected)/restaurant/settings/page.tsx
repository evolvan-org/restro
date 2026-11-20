import { redirect } from 'next/navigation';

/** Default restaurant settings tab is General. */
export default function SettingsIndexPage(): never {
  redirect('/restaurant/settings/general');
}
