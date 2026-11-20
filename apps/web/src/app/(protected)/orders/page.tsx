import { redirect } from 'next/navigation';

/** The live orders board lives on the dashboard floor view. */
export default function OrdersRedirect(): never {
  redirect('/dashboard');
}
