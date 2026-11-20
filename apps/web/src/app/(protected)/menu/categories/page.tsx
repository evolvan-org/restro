import { redirect } from 'next/navigation';

/** Menu categories setup is consolidated into restaurant settings. */
export default function MenuCategoriesRedirect(): never {
  redirect('/restaurant/settings/menu-categories');
}
