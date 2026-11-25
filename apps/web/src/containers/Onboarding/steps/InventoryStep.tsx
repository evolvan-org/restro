'use client';

import {
  findInventoryRowIssues,
  INVENTORY_CSV_MAX_BYTES,
  ONBOARDING_INVENTORY_MAX_ROWS,
  type OnboardingInventoryDraft,
  type OnboardingInventoryRow,
  type OnboardingRowIssue,
} from '@rms/api-contract';
import { ArrowRight, Plus } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { getApiErrorMessage } from '@/lib/api-error';
import { useAiUsage } from '@/services/api/requests/ai';
import { usePreviewInventoryCsv } from '@/services/api/requests/onboarding';

import { CsvUpload } from '../CsvUpload';
import { plural } from '../format';
import { newKey } from '../keys';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { btn, Seg } from '../ui/kit';
import { useStepNavigation } from '../useStepNavigation';
import { IngredientTable } from './inventory/IngredientTable';
import { useInvoiceScan } from './inventory/InvoiceScanPanel';

type Mode = NonNullable<OnboardingInventoryDraft['mode']>;
const MODES = [
  { value: 'scan', label: 'Scan supplier invoice', ai: true },
  { value: 'csv', label: 'Import CSV' },
  { value: 'manual', label: 'Add manually' },
  { value: 'later', label: 'Do it later' },
] as const;

const TEMPLATE = [
  'name*,base_unit*,reorder_level*,sku,opening_quantity,opening_unit_cost',
  'Basmati rice,G,2000,RICE-01,10000,0.09',
  'Milk,ML,5000,,,',
];

/**
 * Inventory (boards "Inventory: pre-filled from recipes / invoice scan and matching / live margin
 * update"): ingredients from the recipes stay in every mode; a scanned invoice fills in opening
 * quantity and real cost.
 */
export default function InventoryStep(): ReactElement {
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('inventory');
  const preview = usePreviewInventoryCsv();
  const ai = useAiUsage();
  const [uploadError, setUploadError] = useState<string>();

  const aiEnabled = ai.data?.enabled !== false;
  const modes = aiEnabled ? MODES : MODES.filter((mode) => mode.value !== 'scan');
  const inventory: OnboardingInventoryDraft = draft.data.inventory ?? { rows: [] };
  const mode: Mode = inventory.mode ?? (aiEnabled && draft.data.recipes ? 'scan' : 'csv');
  const save = (patch: Partial<OnboardingInventoryDraft>): void =>
    setStepData('inventory', { ...inventory, ...patch });
  const updateRow = (key: string, patch: Partial<OnboardingInventoryRow>): void =>
    save({ rows: inventory.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) });

  const issues = findInventoryRowIssues(inventory.rows);
  const issuesByRow = new Map<number, OnboardingRowIssue[]>();
  for (const issue of issues)
    issuesByRow.set(issue.index, [...(issuesByRow.get(issue.index) ?? []), issue]);
  const errorCount = issuesByRow.size;
  const readyCount = inventory.rows.length - errorCount;

  const renderTable = (highlight?: ReadonlySet<string>, compact = false): ReactElement => (
    <IngredientTable
      rows={inventory.rows}
      issues={issuesByRow}
      highlight={highlight}
      compact={compact}
      onChange={updateRow}
      onRemove={
        mode === 'manual'
          ? (key) => save({ rows: inventory.rows.filter((row) => row.key !== key) })
          : undefined
      }
    />
  );
  const scanView = useInvoiceScan({
    data: draft.data,
    inventory,
    save,
    menuSkipped: draft.skippedSteps.includes('menu'),
    onSwitchMode: (next) => save({ mode: next }),
    table: renderTable,
  });
  const table = renderTable();

  function onFile(file: File): void {
    setUploadError(undefined);
    preview.mutate(file, {
      onSuccess: (result) => {
        const names = new Set(result.rows.map((row) => row.name.trim().toLowerCase()));
        save({
          fileName: file.name,
          rows: [
            ...inventory.rows.filter((row) => !names.has(row.name.trim().toLowerCase())),
            ...result.rows.map((row) => ({ ...row, origin: 'csv' as const })),
          ],
        });
      },
      onError: (error) => setUploadError(getApiErrorMessage(error, "We couldn't read that file.")),
    });
  }

  const empty = mode !== 'later' && inventory.rows.length === 0;
  const scanBusy = mode === 'scan' && Boolean(scanView.primary);

  async function onContinue(): Promise<void> {
    if (empty || errorCount > 0) return;
    await nav.next();
  }

  const modeSwitch = (
    <Seg
      label="How to add your ingredients"
      options={modes}
      value={mode}
      onChange={(next: Mode) => save({ mode: next })}
    />
  );
  const continueButton = (
    <button
      type="button"
      className={btn('primary')}
      disabled={empty || errorCount > 0 || nav.busy}
      onClick={() => void onContinue()}
    >
      Save and continue
      <ArrowRight aria-hidden />
    </button>
  );

  return (
    <Shell
      step="inventory"
      title="Inventory"
      description={
        mode === 'scan'
          ? scanView.sub
          : 'The ingredients you stock, with opening quantity and real cost.'
      }
      headerRight={modeSwitch}
      width="wide"
      floating={mode === 'scan' ? scanView.floating : undefined}
      complete={errorCount === 0}
      hint={
        errorCount
          ? `${errorCount} ingredient${errorCount === 1 ? ' needs' : 's need'} fixing.`
          : undefined
      }
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        note: mode === 'scan' ? scanView.note : undefined,
        secondary:
          errorCount > 0 && readyCount > 0 && !scanBusy ? (
            <button
              type="button"
              className={btn()}
              onClick={() =>
                save({ rows: inventory.rows.filter((_, index) => !issuesByRow.has(index)) })
              }
            >
              Keep {readyCount}, leave out {errorCount}
            </button>
          ) : undefined,
        primary: scanBusy ? scanView.primary : continueButton,
      }}
    >
      {mode === 'scan' && scanView.content}

      {mode === 'csv' && (
        <Section title="Upload your ingredients">
          <p className="text-sm text-muted-foreground">
            Same format as Inventory › Import, so one file works in both places. base_unit is G, ML
            or UNIT. Up to {ONBOARDING_INVENTORY_MAX_ROWS} rows. Ingredients from your recipes stay
            in the list.
          </p>
          <CsvUpload
            templateName="inventory-template.csv"
            templateLines={TEMPLATE}
            fileName={inventory.fileName}
            summary={`${plural(inventory.rows.length, 'row')}${errorCount ? '' : ' · all valid'}`}
            busy={preview.isPending}
            error={uploadError}
            maxBytes={INVENTORY_CSV_MAX_BYTES}
            onFile={onFile}
          />
        </Section>
      )}

      {mode === 'later' && (
        <Section title="You can add stock later">
          <p className="text-sm text-muted-foreground">
            The ingredients below are still created, without opening stock. Record a purchase from
            Inventory any time.
          </p>
        </Section>
      )}

      {mode !== 'scan' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold tracking-[-0.01em]">
              {inventory.rows.length} ingredients
            </span>
            {mode === 'manual' && (
              <button
                type="button"
                className={btn('default', 'sm')}
                disabled={inventory.rows.length >= ONBOARDING_INVENTORY_MAX_ROWS}
                onClick={() =>
                  save({
                    rows: [
                      ...inventory.rows,
                      {
                        key: newKey(),
                        name: '',
                        sku: '',
                        baseUnit: 'G',
                        reorderLevel: '0',
                        openingQuantity: '',
                        openingUnitCost: '',
                        origin: 'manual',
                        costSource: 'manual',
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                Add ingredient
              </button>
            )}
          </div>
          {inventory.rows.length > 0 ? (
            table
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              {mode === 'csv'
                ? 'Upload your inventory CSV'
                : mode === 'manual'
                  ? 'Add an ingredient'
                  : 'Nothing to add yet'}{' '}
              to continue, or choose Skip this step.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Opening stock is recorded as the first stock entry, dated the day you finish setup.
          </p>
        </>
      )}
    </Shell>
  );
}
