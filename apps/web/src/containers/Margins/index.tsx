'use client';

import { formatInr } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Receipt, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { CostBandBadge } from '@/components/AiScan/markers';
import { buttonVariants } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { useMarginReport } from '@/services/api/requests/ai';

/** Margin report: plate cost, food-cost % and margin per dish and portion, lowest margin first. */
export default function Margins(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.REPORT_READ]);
  const { can } = usePermissions();
  const report = useMarginReport(allowed);
  if (!allowed) return null;
  const data = report.data;
  const needCost = data?.rows.filter((row) => row.missingPrices > 0).length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Menu</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Margins</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            What every plate costs to make, from its recipe and the latest ingredient costs.
          </p>
        </div>
        {can(Permission.INVENTORY_SCAN_INVOICE) && (
          <Link href="/inventory/scan-invoice" className={buttonVariants({ variant: 'outline' })}>
            <Receipt aria-hidden />
            Scan a supplier invoice
          </Link>
        )}
      </div>

      {report.isError && (
        <p role="alert" className="text-sm text-red-700">
          We couldn&apos;t load the margin report.
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Average food cost</p>
              <p className="text-2xl font-bold tabular-nums">
                {data.averageFoodCostPercent === null ? '—' : `${data.averageFoodCostPercent}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                Target {data.target.min}–{data.target.max}%
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Average margin</p>
              <p className="text-2xl font-bold tabular-nums">
                {data.averageFoodCostPercent === null
                  ? '—'
                  : `${(100 - data.averageFoodCostPercent).toFixed(1)}%`}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Dishes without a recipe</p>
              <p className="text-2xl font-bold tabular-nums">{data.missingRecipes}</p>
            </div>
          </div>
          {needCost > 0 && (
            <p className="text-sm text-muted-foreground">
              Food cost shows once every ingredient in a dish has a real cost. {needCost}{' '}
              {needCost === 1 ? 'dish is' : 'dishes are'} waiting on ingredient costs: scan a
              supplier invoice or record a purchase in Inventory.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Dish</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 text-right font-semibold">Plate cost</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Food cost</th>
                  <th className="px-3 py-2 text-right font-semibold">Margin</th>
                  <th className="px-3 py-2 font-semibold">Band</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={`${row.menuItemId}:${row.variantId ?? ''}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-3 py-2 font-medium">
                      {row.name}
                      {row.recipeUnreviewed && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-800">
                          <Sparkles className="size-3" aria-hidden />
                          AI draft
                        </span>
                      )}
                      {row.missingPrices > 0 && (
                        <span className="ml-2 text-xs text-amber-800">
                          Needs a cost for {row.missingPrices}{' '}
                          {row.missingPrices === 1 ? 'ingredient' : 'ingredients'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.plateCost === null ? '—' : formatInr(row.plateCost, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatInr(row.sellingPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.foodCostPercent === null ? '—' : `${row.foodCostPercent}%`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.marginPercent === null ? '—' : `${row.marginPercent}%`}
                    </td>
                    <td className="px-3 py-2">{row.band && <CostBandBadge band={row.band} />}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No dishes have recipes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
