'use client';

import type { InventoryItem } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';

import {
  BatchList,
  ItemList,
  MovementList,
  PurchaseList,
  ReceiptList,
  SupplierList,
} from './inventory-lists';

const tabs = [
  ['items', 'Ingredients'],
  ['batches', 'Batches'],
  ['movements', 'Movement history'],
  ['suppliers', 'Suppliers'],
  ['purchases', 'Purchase orders'],
  ['receipts', 'Goods receipts'],
] as const;
type Tab = (typeof tabs)[number][0];

export default function Inventory(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.INVENTORY_MANAGE]);
  const [tab, setTab] = useState<Tab>('items');
  const [historyItem, setHistoryItem] = useState<InventoryItem>();
  const { can } = usePermissions();

  if (!allowed) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Inventory</h1>
        {can(Permission.INVENTORY_SCAN_INVOICE) && (
          <Link href="/inventory/scan-invoice" className={buttonVariants({ variant: 'outline' })}>
            <Receipt aria-hidden />
            Scan invoice
          </Link>
        )}
      </div>
      <nav
        aria-label="Inventory views"
        className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5"
      >
        {tabs.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            aria-pressed={tab === value}
            variant={tab === value ? 'secondary' : 'ghost'}
            onClick={() => {
              setHistoryItem(undefined);
              setTab(value);
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === 'items' && (
        <ItemList
          onHistory={(item) => {
            setHistoryItem(item);
            setTab('movements');
          }}
        />
      )}
      {tab === 'batches' && <BatchList />}
      {tab === 'movements' && (
        <MovementList item={historyItem} onClear={() => setHistoryItem(undefined)} />
      )}
      {tab === 'suppliers' && <SupplierList />}
      {tab === 'purchases' && <PurchaseList />}
      {tab === 'receipts' && <ReceiptList />}
    </div>
  );
}
