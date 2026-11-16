'use client';

import { Permission } from '@rms/permissions';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { useBillInvoice } from '@/services/api/requests/bills';

import layout from './billing.module.css';
import styles from './invoice.module.css';
import LineItems from './LineItems';
import QueryState from './QueryState';

export default function Invoice({ id }: { id: string }): ReactElement | null {
  const allowed = usePermissionGuard([Permission.BILL_READ]);
  const query = useBillInvoice(id, allowed);
  if (!allowed) return null;
  const invoice = query.data;
  const bill = invoice?.bill;
  return (
    <div className={`${layout.screen} ${styles.screen}`}>
      <div className={styles.content}>
        <div className={styles.controls}>
          <Link href={`/billing/${id}`} className={layout.backLink}>
            <ArrowLeft className="size-4" aria-hidden /> Back to bill
          </Link>
          <Button
            className={layout.touchButton}
            disabled={!invoice || query.isError || query.isFetching}
            onClick={() => window.print()}
          >
            <Printer aria-hidden /> Print invoice
          </Button>
        </div>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {invoice && bill && !query.isError && (
          <article className={styles.invoice} aria-label="Invoice">
            <header className="space-y-2 border-b pb-6">
              <h1 className="break-words text-2xl font-semibold">{invoice.restaurant.name}</h1>
              {invoice.restaurant.address && (
                <p className="break-words whitespace-pre-line text-sm">
                  {invoice.restaurant.address}
                </p>
              )}
              {invoice.restaurant.gstNumber && (
                <p className="text-sm">GSTIN: {invoice.restaurant.gstNumber}</p>
              )}
              <h2 className="pt-3 text-lg font-semibold">
                {bill.status === 'PAID' ? 'Tax invoice — paid' : 'Proforma — unpaid'}
              </h2>
              <p className="text-sm">
                {bill.billNumber} ·{' '}
                {new Date(bill.generatedAt).toLocaleString(undefined, { timeZone: bill.timezone })}
              </p>
              <p className="break-words text-sm">
                Table {bill.table.tableNumber} · Order {bill.orderId}
              </p>
            </header>
            <div className="my-6">
              <LineItems lines={bill.lines} />
            </div>
            <dl className={`${layout.totals} ${styles.totals}`}>
              <dt>Subtotal</dt>
              <dd className="text-right">{bill.subtotal}</dd>
              <dt>Discount</dt>
              <dd className="text-right">{bill.discountAmount}</dd>
              <dt>CGST ({invoice.cgst.rate}%)</dt>
              <dd className="text-right">{invoice.cgst.amount}</dd>
              <dt>SGST ({invoice.sgst.rate}%)</dt>
              <dd className="text-right">{invoice.sgst.amount}</dd>
              <dt className={layout.totalLabel}>Total</dt>
              <dd className={layout.totalValue}>
                {bill.currency} {bill.totalAmount}
              </dd>
            </dl>
            {bill.status === 'PAID' && (
              <footer className="mt-8 border-t pt-4 text-sm">
                <p>Paid{invoice.payment && ` by ${invoice.payment.method}`}</p>
                {invoice.payment?.referenceNumber && (
                  <p className="break-all">Reference: {invoice.payment.referenceNumber}</p>
                )}
                {(invoice.payment?.paidAt ?? bill.paidAt) && (
                  <p>
                    Paid at:{' '}
                    {new Date((invoice.payment?.paidAt ?? bill.paidAt)!).toLocaleString(undefined, {
                      timeZone: bill.timezone,
                    })}
                  </p>
                )}
              </footer>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
