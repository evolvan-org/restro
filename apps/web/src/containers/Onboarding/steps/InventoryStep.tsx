'use client';

import {
  findInventoryRowIssues,
  INVENTORY_CSV_MAX_BYTES,
  ONBOARDING_INVENTORY_MAX_ROWS,
  type OnboardingInventoryDraft,
  type OnboardingInventoryRow,
} from '@rms/api-contract';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getApiErrorMessage } from '@/lib/api-error';
import { usePreviewInventoryCsv } from '@/services/api/requests/onboarding';

import { CsvUpload } from '../CsvUpload';
import { plural } from '../format';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { useStepNavigation } from '../useStepNavigation';

const TEMPLATE = [
  'name*,base_unit*,reorder_level*,sku,opening_quantity,opening_unit_cost',
  'Basmati rice,G,2000,RICE-01,10000,0.09',
  'Milk,ML,5000,,,',
];
const SHOWN_READY_ROWS = 6;

export default function InventoryStep(): ReactElement {
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('inventory');
  const preview = usePreviewInventoryCsv();
  const [uploadError, setUploadError] = useState<string>();
  const [showAll, setShowAll] = useState(false);

  const inventory: OnboardingInventoryDraft = draft.data.inventory ?? { rows: [] };
  const save = (patch: Partial<OnboardingInventoryDraft>): void =>
    setStepData('inventory', { ...inventory, ...patch });
  const updateRow = (key: string, patch: Partial<OnboardingInventoryRow>): void =>
    save({ rows: inventory.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) });

  const issues = findInventoryRowIssues(inventory.rows);
  const issuesByRow = new Map<number, typeof issues>();
  for (const issue of issues) {
    issuesByRow.set(issue.index, [...(issuesByRow.get(issue.index) ?? []), issue]);
  }
  const errorCount = issuesByRow.size;
  const readyCount = inventory.rows.length - errorCount;
  const withOpening = inventory.rows.filter((row) => row.openingQuantity.trim()).length;

  const indexed = inventory.rows.map((row, index) => ({ row, index }));
  const visible = [
    ...indexed.filter(({ index }) => issuesByRow.has(index)),
    ...indexed
      .filter(({ index }) => !issuesByRow.has(index))
      .slice(0, showAll ? undefined : SHOWN_READY_ROWS),
  ];

  function onFile(file: File): void {
    setUploadError(undefined);
    preview.mutate(file, {
      onSuccess: (result) => {
        save({ fileName: file.name, rows: result.rows });
        setShowAll(false);
      },
      onError: (error) => setUploadError(getApiErrorMessage(error, "We couldn't read that file.")),
    });
  }

  // Nothing to save until a file is uploaded.
  const empty = inventory.rows.length === 0;

  async function onContinue(): Promise<void> {
    if (empty || errorCount > 0) return;
    setStepData('inventory', inventory);
    await nav.next();
  }

  const fields: {
    key: keyof OnboardingInventoryRow;
    label: string;
    className?: string;
  }[] = [
    { key: 'name', label: 'Ingredient' },
    { key: 'reorderLevel', label: 'Reorder at', className: 'w-28' },
    { key: 'openingQuantity', label: 'Opening qty', className: 'w-28' },
    { key: 'openingUnitCost', label: 'Unit cost (₹)', className: 'w-28' },
  ];

  return (
    <Shell
      step="inventory"
      title="Inventory"
      description="Import the ingredients you stock. Later, recipes link menu items to these so stock goes down as you sell."
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        secondary:
          errorCount > 0 && readyCount > 0 ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => save({ rows: inventory.rows.filter((_, i) => !issuesByRow.has(i)) })}
            >
              Import {readyCount}, leave out {errorCount}
            </Button>
          ) : undefined,
        primary: (
          <Button
            className="h-11 px-5"
            disabled={empty || errorCount > 0 || nav.busy}
            onClick={() => void onContinue()}
          >
            Save and continue
          </Button>
        ),
      }}
    >
      <Section title="Upload your ingredients">
        <p className="text-sm text-neutral-700">
          Same format as Inventory › Import, so one file works in both places. base_unit is G, ML or
          UNIT. Up to {ONBOARDING_INVENTORY_MAX_ROWS} rows.
        </p>
        <CsvUpload
          templateName="inventory-template.csv"
          templateLines={TEMPLATE}
          fileName={inventory.fileName}
          summary={`${plural(inventory.rows.length, 'row')}${
            errorCount ? '' : ' · all valid'
          } · ${withOpening} with opening stock`}
          busy={preview.isPending}
          error={uploadError}
          maxBytes={INVENTORY_CSV_MAX_BYTES}
          onFile={onFile}
        />
      </Section>

      {empty && (
        <p className="text-sm text-neutral-600" role="status">
          Upload your inventory CSV to continue, or choose Skip for now.
        </p>
      )}

      {inventory.rows.length > 0 && (
        <Section title={`${readyCount} ready${errorCount ? ` · ${errorCount} need fixing` : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs text-neutral-600">
                <tr>
                  <th className="pb-2 pr-2 font-medium">Ingredient</th>
                  <th className="pb-2 pr-2 font-medium">Unit</th>
                  <th className="pb-2 pr-2 font-medium">Reorder at</th>
                  <th className="pb-2 pr-2 font-medium">Opening qty</th>
                  <th className="pb-2 font-medium">Unit cost (₹)</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, index }) => {
                  const rowIssues = issuesByRow.get(index) ?? [];
                  const label = row.line ? `row ${row.line}` : `row ${index + 1}`;
                  return (
                    <tr key={row.key} className={rowIssues.length ? 'bg-red-50/60' : ''}>
                      {fields.slice(0, 1).map((field) => (
                        <td key={field.key} className="py-1.5 pr-2 align-top">
                          <Input
                            className="h-11"
                            aria-label={`${field.label}, ${label}`}
                            value={String(row[field.key])}
                            aria-invalid={rowIssues.some((i) => i.field === field.key)}
                            onChange={(e) => updateRow(row.key, { [field.key]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 pr-2 align-top">
                        <NativeSelect
                          className="w-full [&_select]:h-11"
                          aria-label={`Unit, ${label}`}
                          value={row.baseUnit.toUpperCase()}
                          aria-invalid={rowIssues.some((i) => i.field === 'baseUnit')}
                          onChange={(e) => updateRow(row.key, { baseUnit: e.target.value })}
                        >
                          {!['G', 'ML', 'UNIT'].includes(row.baseUnit.toUpperCase()) && (
                            <option value={row.baseUnit}>{row.baseUnit || 'Choose…'}</option>
                          )}
                          <option value="G">G</option>
                          <option value="ML">ML</option>
                          <option value="UNIT">UNIT</option>
                        </NativeSelect>
                      </td>
                      {fields.slice(1).map((field) => (
                        <td key={field.key} className="py-1.5 pr-2 align-top">
                          <Input
                            className={`h-11 ${field.className ?? ''}`}
                            inputMode="decimal"
                            aria-label={`${field.label}, ${label}`}
                            value={String(row[field.key])}
                            aria-invalid={rowIssues.some((i) => i.field === field.key)}
                            onChange={(e) => updateRow(row.key, { [field.key]: e.target.value })}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errorCount > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-red-700" aria-label="Problems to fix">
              {visible.flatMap(({ row, index }) =>
                (issuesByRow.get(index) ?? []).map((issue) => (
                  <li key={`${index}-${issue.field}`}>
                    {row.line ? `Row ${row.line}` : `Row ${index + 1}`} · {issue.field}:{' '}
                    {issue.message}
                  </li>
                )),
              )}
            </ul>
          )}
          {inventory.rows.length - errorCount > SHOWN_READY_ROWS && (
            <Button
              variant="ghost"
              className="h-11 self-start"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Show fewer rows' : `Show all ${inventory.rows.length} rows`}
            </Button>
          )}
          <p className="text-xs text-neutral-600">
            Opening stock is recorded as the first stock entry, dated the day you finish setup.
          </p>
        </Section>
      )}
    </Shell>
  );
}
