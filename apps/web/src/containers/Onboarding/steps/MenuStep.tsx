'use client';

import {
  findMenuRowIssues,
  MENU_CSV_COLUMNS,
  ONBOARDING_MENU_CSV_MAX_BYTES,
  ONBOARDING_MENU_MAX_ROWS,
  type OnboardingMenuDraft,
  type OnboardingMenuRow,
  summarizeMenuCategories,
} from '@rms/api-contract';
import { Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getApiErrorMessage } from '@/lib/api-error';
import { useAiUsage } from '@/services/api/requests/ai';
import { usePreviewMenuCsv } from '@/services/api/requests/onboarding';

import { CsvUpload } from '../CsvUpload';
import { plural } from '../format';
import { newKey } from '../keys';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { Seg } from '../ui/kit';
import { useStepNavigation } from '../useStepNavigation';
import { MenuScanStep } from './menu/MenuScanPanel';

type Mode = OnboardingMenuDraft['mode'];

const MODES = [
  { value: 'scan', label: 'Scan menu photo', ai: true },
  { value: 'csv', label: 'Import CSV' },
  { value: 'manual', label: 'Add manually' },
  { value: 'later', label: 'Do it later' },
] as const;

const TEMPLATE = [
  'category*,type*,name*,price*,description,available',
  'Starters,FOOD,Paneer Tikka,240,Smoky cottage cheese,true',
  'Coolers,BAR,Lime Soda,90,,true',
];
const SHOWN_READY_ROWS = 5;

function emptyRow(): OnboardingMenuRow {
  return {
    key: newKey(),
    category: '',
    type: 'FOOD',
    name: '',
    price: '',
    description: '',
    available: true,
  };
}

export default function MenuStep(): ReactElement {
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('menu');
  const preview = usePreviewMenuCsv();
  const [uploadError, setUploadError] = useState<string>();
  const [showAll, setShowAll] = useState(false);

  const ai = useAiUsage();
  const aiEnabled = ai.data?.enabled !== false;
  const modes = aiEnabled ? MODES : MODES.filter((mode) => mode.value !== 'scan');
  const menu: OnboardingMenuDraft = draft.data.menu ?? {
    mode: aiEnabled ? 'scan' : 'csv',
    rows: [],
  };
  const scanning = menu.mode === 'scan';
  const save = (patch: Partial<OnboardingMenuDraft>): void =>
    setStepData('menu', { ...menu, ...patch });
  const updateRow = (key: string, patch: Partial<OnboardingMenuRow>): void =>
    save({ rows: menu.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) });

  const issues = findMenuRowIssues(menu.rows);
  const issuesByRow = new Map<number, typeof issues>();
  for (const issue of issues)
    issuesByRow.set(issue.index, [...(issuesByRow.get(issue.index) ?? []), issue]);
  const errorCount = issuesByRow.size;
  const included = menu.rows.filter((row) => !row.excluded);
  const readyCount = menu.rows.length - errorCount;
  const categories = summarizeMenuCategories(menu.rows);
  const mixed = categories.filter((category) => category.mixedTypes);

  // Rows with problems first, then a few good ones (everything in manual mode).
  const indexed = menu.rows.map((row, index) => ({ row, index }));
  const manual = menu.mode === 'manual';
  const visible = manual
    ? indexed
    : [
        ...indexed.filter(({ index }) => issuesByRow.has(index)),
        ...indexed
          .filter(({ index }) => !issuesByRow.has(index))
          .slice(0, showAll ? undefined : SHOWN_READY_ROWS),
      ];

  function onFile(file: File): void {
    setUploadError(undefined);
    preview.mutate(file, {
      onSuccess: (result) => {
        save({ mode: 'csv', fileName: file.name, rows: result.rows });
        setShowAll(false);
      },
      onError: (error) => setUploadError(getApiErrorMessage(error, "We couldn't read that file.")),
    });
  }

  // Nothing to save until a file is uploaded (or an item added); "Do it later" needs nothing.
  const empty = menu.mode !== 'later' && included.length === 0;

  async function onContinue(): Promise<void> {
    if (menu.mode !== 'later' && (empty || errorCount > 0)) return;
    setStepData('menu', menu);
    await nav.next();
  }

  const blocked = menu.mode !== 'later' && (empty || errorCount > 0);
  const modeSwitch = (
    <Seg
      label="How to add your menu"
      options={modes}
      value={menu.mode}
      onChange={(mode: Mode) => save({ mode })}
    />
  );

  if (scanning) {
    return (
      <MenuScanStep
        menu={menu}
        save={save}
        nav={nav}
        modeSwitch={modeSwitch}
        onSwitchMode={(mode) => save({ mode })}
      />
    );
  }

  return (
    <Shell
      step="menu"
      title="Menu"
      description="Import your dishes and drinks from a spreadsheet. Food goes to the kitchen display, bar items to the bar display."
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        secondary:
          menu.mode === 'csv' && errorCount > 0 && readyCount > 0 ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                save({ rows: menu.rows.filter((_, index) => !issuesByRow.has(index)) })
              }
            >
              Import {readyCount}, leave out {errorCount}
            </Button>
          ) : undefined,
        primary: (
          <Button
            className="h-11 px-5"
            disabled={blocked || nav.busy}
            onClick={() => void onContinue()}
          >
            Save and continue
          </Button>
        ),
      }}
    >
      <div className="self-start">{modeSwitch}</div>

      {menu.mode === 'csv' && (
        <Section title="Upload your menu">
          <p className="text-sm text-muted-foreground">
            Columns: {MENU_CSV_COLUMNS.join(', ')}. Required: category, type (FOOD or BAR), name,
            price. Categories are created from the category column. Up to {ONBOARDING_MENU_MAX_ROWS}{' '}
            rows.
          </p>
          <CsvUpload
            templateName="menu-template.csv"
            templateLines={TEMPLATE}
            fileName={menu.fileName}
            summary={`${plural(menu.rows.length, 'row')} · ${plural(categories.length, 'category', 'categories')}`}
            busy={preview.isPending}
            error={uploadError}
            maxBytes={ONBOARDING_MENU_CSV_MAX_BYTES}
            onFile={onFile}
          />
        </Section>
      )}

      {empty && !scanning && (
        <p className="text-sm text-muted-foreground" role="status">
          {menu.mode === 'csv'
            ? 'Upload your menu CSV to continue, or choose Skip for now.'
            : 'Add at least one item to continue, or choose Skip for now.'}
        </p>
      )}

      {menu.mode !== 'later' && !scanning && menu.rows.length > 0 && (
        <Section
          title={`${readyCount} ready${errorCount ? ` · ${errorCount} need fixing` : ''}`}
          description={
            categories.length
              ? `Categories: ${categories.map((c) => `${c.name} (${c.type})`).join(', ')}`
              : undefined
          }
        >
          {mixed.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
              {mixed.map((c) => c.name).join(', ')} mixes food and bar items. Each item&apos;s own
              type still decides where it goes.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2 font-medium">Row</th>
                  <th className="pb-2 pr-2 font-medium">Category</th>
                  <th className="pb-2 pr-2 font-medium">Type</th>
                  <th className="pb-2 pr-2 font-medium">Item</th>
                  <th className="pb-2 pr-2 font-medium">Price (₹)</th>
                  <th className="pb-2 font-medium">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, index }, position) => {
                  const rowIssues = issuesByRow.get(index) ?? [];
                  const fieldError = (field: string): string | undefined =>
                    rowIssues.find((issue) => issue.field === field)?.message;
                  const bad = rowIssues.length > 0;
                  return (
                    <tr key={row.key} className={bad ? 'bg-red-50/60' : ''}>
                      <td className="py-1.5 pr-2 align-top text-muted-foreground">
                        {row.line ?? position + 1}
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Input
                          className="h-11"
                          aria-label={`Category, row ${row.line ?? position + 1}`}
                          value={row.category}
                          aria-invalid={Boolean(fieldError('category'))}
                          onChange={(event) => updateRow(row.key, { category: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <NativeSelect
                          className="w-full [&_select]:h-11"
                          aria-label={`Type, row ${row.line ?? position + 1}`}
                          value={row.type.toUpperCase()}
                          aria-invalid={Boolean(fieldError('type'))}
                          onChange={(event) => updateRow(row.key, { type: event.target.value })}
                        >
                          {!['FOOD', 'BAR'].includes(row.type.toUpperCase()) && (
                            <option value={row.type}>{row.type || 'Choose…'}</option>
                          )}
                          <option value="FOOD">FOOD</option>
                          <option value="BAR">BAR</option>
                        </NativeSelect>
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Input
                          className="h-11"
                          aria-label={`Item name, row ${row.line ?? position + 1}`}
                          value={row.name}
                          aria-invalid={Boolean(fieldError('name'))}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Input
                          className="h-11 w-28"
                          inputMode="decimal"
                          aria-label={`Price, row ${row.line ?? position + 1}`}
                          value={row.price}
                          aria-invalid={Boolean(fieldError('price'))}
                          onChange={(event) => updateRow(row.key, { price: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 align-top">
                        {manual ? (
                          <Button
                            variant="ghost"
                            className="size-11"
                            aria-label={`Remove row ${position + 1}`}
                            onClick={() =>
                              save({ rows: menu.rows.filter((r) => r.key !== row.key) })
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.flatMap(({ index }) => issuesByRow.get(index) ?? []).length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-red-700" aria-label="Problems to fix">
              {visible.flatMap(({ index }) =>
                (issuesByRow.get(index) ?? []).map((issue) => (
                  <li key={`${index}-${issue.field}`}>
                    {issue.line ? `Row ${issue.line}` : `Row ${index + 1}`} · {issue.field}:{' '}
                    {issue.message}
                  </li>
                )),
              )}
            </ul>
          )}
          {!manual && menu.rows.length - errorCount > SHOWN_READY_ROWS && (
            <Button
              variant="ghost"
              className="h-11 self-start"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Show fewer rows' : `Show all ${menu.rows.length} rows`}
            </Button>
          )}
        </Section>
      )}

      {menu.mode === 'manual' && (
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={menu.rows.length >= ONBOARDING_MENU_MAX_ROWS}
          onClick={() => save({ rows: [...menu.rows, emptyRow()] })}
        >
          <Plus aria-hidden />
          Add item
        </Button>
      )}

      {menu.mode === 'later' && (
        <Section title="You can add the menu later">
          <p className="text-sm text-muted-foreground">
            Captains can&apos;t take orders until there&apos;s a menu. We&apos;ll put &quot;Add your
            menu&quot; at the top of your dashboard checklist.
          </p>
        </Section>
      )}

      {menu.mode !== 'later' && (
        <p className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
          <Sparkles className="mt-0.5 size-4 flex-none" aria-hidden />
          <span>
            <strong className="font-semibold">
              Next, we&apos;ll draft recipes and food cost for these dishes.
            </strong>{' '}
            You&apos;ll see what each plate costs and where your margin is thin.
          </span>
        </p>
      )}
    </Shell>
  );
}
