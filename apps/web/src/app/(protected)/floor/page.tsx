import { redirect } from 'next/navigation';

/** The live floor board now lives on the dashboard (default "Live Floor View"). */
export default function FloorRedirect(): never {
  redirect('/dashboard');
}
