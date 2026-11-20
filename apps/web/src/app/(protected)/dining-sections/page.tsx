import { redirect } from 'next/navigation';

/** Dining sections setup is consolidated into restaurant settings. */
export default function DiningSectionsRedirect(): never {
  redirect('/restaurant/settings/dining-sections');
}
