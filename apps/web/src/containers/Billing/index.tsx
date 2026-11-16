'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Permission } from '@rms/permissions';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  LayoutGrid,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button, buttonVariants } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { useBills } from '@/services/api/requests/bills';

import styles from './list.module.css';
import {
  billingFilterDefaults,
  type BillingFilters,
  billingFiltersSchema,
  billStatusLabel,
} from './mappers';
import QueryState from './QueryState';

export default function Billing(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.BILL_READ]);
  const { control, setValue } = useForm<BillingFilters>({
    resolver: zodResolver(billingFiltersSchema),
    defaultValues: billingFilterDefaults(),
  });
  const { status = '', page = 1 } = useWatch({ control });
  const bills = useBills({ page, pageSize: 20, ...(status ? { status } : {}) }, allowed);
  if (!allowed) return null;
  return (
    <section className={styles.screen} aria-label="Billing">
      <header className={styles.header}>
        <div className={styles.toolbar}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Billing</h1>
            <p className={styles.subtitle}>Review bills and print invoices.</p>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="outline"
              className={styles.actionButton}
              disabled={bills.isFetching}
              onClick={() => void bills.refetch()}
              aria-label="Refresh bills"
              title="Refresh bills"
            >
              <RefreshCw className={bills.isFetching ? 'animate-spin' : ''} aria-hidden />
              <span className={styles.actionText}>Refresh</span>
            </Button>
            <Link
              href="/floor"
              className={`${buttonVariants({ variant: 'outline' })} ${styles.actionButton}`}
              aria-label="Floor board"
              title="Floor board"
            >
              <LayoutGrid aria-hidden /> <span className={styles.actionText}>Floor board</span>
            </Link>
          </div>
        </div>
        <div className={styles.filterBar}>
          <div className={styles.filters} role="group" aria-label="Filter bills by status">
            {(['', 'OPEN', 'PAID', 'CANCELLED'] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={styles.filter}
                data-status={value}
                aria-pressed={status === value}
                onClick={() => {
                  setValue('status', value);
                  setValue('page', 1);
                }}
              >
                {value && <span className={styles.statusDot} aria-hidden />}
                {value ? billStatusLabel(value) : 'All bills'}
              </button>
            ))}
          </div>
          {bills.data && !bills.isError && !bills.isPlaceholderData && (
            <span className={styles.resultCount}>
              {bills.data.meta.total} {bills.data.meta.total === 1 ? 'bill' : 'bills'}
            </span>
          )}
        </div>
      </header>
      <div className={styles.body} aria-busy={bills.isFetching}>
        <QueryState
          pending={bills.isPending}
          error={bills.error}
          retry={() => void bills.refetch()}
        />
        {bills.data && !bills.isError && (
          <>
            <div className={styles.sectionHeading}>
              <h2>{status ? `${billStatusLabel(status)} bills` : 'All bills'}</h2>
              <p role="status">
                {bills.isFetching ? 'Updating…' : `${bills.data.data.length} on this page`}
              </p>
            </div>
            {bills.data.data.length > 0 ? (
              <div className={styles.billGrid} aria-label="Bills">
                {bills.data.data.map((bill) => (
                  <Link
                    key={bill.id}
                    className={styles.billCard}
                    data-status={bill.status}
                    href={`/billing/${bill.id}`}
                    aria-label={`View bill ${bill.billNumber}, table ${bill.table.tableNumber}`}
                  >
                    <div>
                      <div className={styles.cardTop}>
                        <p className={styles.tableLabel}>Table {bill.table.tableNumber}</p>
                        <ArrowUpRight className={styles.cardArrow} aria-hidden />
                      </div>
                      <p className={styles.cardStatus}>
                        <span className={styles.statusDot} aria-hidden />
                        {billStatusLabel(bill.status)}
                      </p>
                      <p className={styles.invoiceNumber}>{bill.billNumber}</p>
                    </div>
                    <div className={styles.cardBottom}>
                      <p className={styles.amount}>
                        <span className={styles.currency}>{bill.currency}</span> {bill.totalAmount}
                      </p>
                      <p className={styles.date}>
                        <Clock aria-hidden />
                        <time dateTime={bill.generatedAt}>
                          {new Date(bill.generatedAt).toLocaleString(undefined, {
                            timeZone: bill.timezone,
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </time>
                      </p>
                      <span className={styles.statusStrip} aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <Receipt aria-hidden />
                </span>
                <h3>
                  {status ? `No ${billStatusLabel(status).toLowerCase()} bills` : 'No bills yet'}
                </h3>
                <p>
                  {status
                    ? 'Choose another status to view other bills.'
                    : 'Generate a bill from a submitted table order. It will appear here.'}
                </p>
              </div>
            )}
            <footer className={styles.pagination}>
              <p>
                Page {bills.data.meta.page} of {Math.max(1, bills.data.meta.totalPages)} ·{' '}
                {bills.data.meta.total} bills
              </p>
              <div className={styles.paginationControls}>
                <Button
                  variant="outline"
                  className={styles.actionButton}
                  disabled={page <= 1 || bills.isFetching}
                  onClick={() => setValue('page', page - 1)}
                >
                  <ArrowLeft aria-hidden /> Previous
                </Button>
                <Button
                  variant="outline"
                  className={styles.actionButton}
                  disabled={page >= bills.data.meta.totalPages || bills.isFetching}
                  onClick={() => setValue('page', page + 1)}
                >
                  Next <ArrowRight aria-hidden />
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
