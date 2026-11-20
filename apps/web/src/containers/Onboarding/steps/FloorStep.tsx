'use client';

import {
  BILL_CANCELLATION_REASON_DEFAULTS,
  completeOnboardingDataSchema,
  ONBOARDING_MAX_TABLE_CAPACITY,
  ONBOARDING_MAX_TABLES_PER_SECTION,
  type OnboardingFloorDraft,
  type OnboardingSectionDraft,
  type OnboardingTableDraft,
} from '@rms/api-contract';
import { Lock, Plus, Trash2, X } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { plural } from '../format';
import { newKey } from '../keys';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { useStepNavigation } from '../useStepNavigation';
import { issuesByPath } from '../validation';

const QUICK_SECTIONS = [
  { name: 'Main hall', prefix: 'T' },
  { name: 'Patio', prefix: 'P' },
  { name: 'Bar', prefix: 'B' },
  { name: 'Private dining', prefix: 'PR' },
  { name: 'Rooftop', prefix: 'R' },
];
const DEFAULT_TABLES = 4;
const DEFAULT_SEATS = 4;

const SYSTEM_STATUSES = [
  { name: 'Available', color: 'bg-emerald-600' },
  { name: 'Reserved', color: 'bg-blue-600' },
  { name: 'Occupied', color: 'bg-amber-600' },
  { name: 'Needs cleaning', color: 'bg-neutral-500' },
];

function makeTables(
  prefix: string,
  count: number,
  seats: number,
  from = 1,
): OnboardingTableDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    key: newKey(),
    number: `${prefix}${from + index}`,
    capacity: String(seats),
  }));
}

function sharedSeats(section: OnboardingSectionDraft): string {
  const [first, ...rest] = section.tables;
  if (!first) return String(DEFAULT_SEATS);
  return rest.every((table) => table.capacity === first.capacity) ? first.capacity : '';
}

function tableSummary(section: OnboardingSectionDraft): string {
  const seats = section.tables.reduce((total, table) => total + (Number(table.capacity) || 0), 0);
  const first = section.tables[0]?.number;
  const last = section.tables.at(-1)?.number;
  const range = !first ? 'No tables' : first === last ? first : `${first}–${last}`;
  return `${range} · ${plural(seats, 'seat')}`;
}

function clampCount(value: string): number {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(count, ONBOARDING_MAX_TABLES_PER_SECTION);
}

type EditingTile = { sectionKey: string; table: OnboardingTableDraft };

export default function FloorStep(): ReactElement {
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('floor');
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState<EditingTile | null>(null);
  const [editingReasons, setEditingReasons] = useState(
    draft.data.floor?.cancellationReasons !== undefined,
  );

  const floor: OnboardingFloorDraft = draft.data.floor ?? { sections: [], customStatuses: [] };
  const save = (patch: Partial<OnboardingFloorDraft>): void => {
    setEdited(true);
    setStepData('floor', { ...floor, ...patch });
  };

  // Recommended step: at least one section, and everything filled in and valid, to continue or exit.
  const problems = Object.fromEntries(
    Object.entries(issuesByPath(completeOnboardingDataSchema.safeParse({ floor }).error)).map(
      ([path, message]) => [path.replace(/^floor\./, ''), message],
    ),
  );
  const noSections = floor.sections.length === 0;
  const complete = !noSections && Object.keys(problems).length === 0;
  const errors = edited ? problems : {};
  const hint = noSections
    ? 'To continue, add at least one section with its tables. Or choose Skip for now.'
    : `To continue, fix: ${[...new Set(Object.values(problems))].slice(0, 3).join(' · ')}. Or choose Skip for now.`;
  const updateSection = (
    key: string,
    change: (section: OnboardingSectionDraft) => OnboardingSectionDraft,
  ): void =>
    save({
      sections: floor.sections.map((section) => (section.key === key ? change(section) : section)),
    });

  function addSection(name: string, prefix: string): void {
    save({
      sections: [
        ...floor.sections,
        { key: newKey(), name, prefix, tables: makeTables(prefix, DEFAULT_TABLES, DEFAULT_SEATS) },
      ],
    });
  }

  function setCount(section: OnboardingSectionDraft, value: string): void {
    const count = clampCount(value);
    const seats = Number(sharedSeats(section)) || DEFAULT_SEATS;
    updateSection(section.key, (current) => ({
      ...current,
      tables:
        count <= current.tables.length
          ? current.tables.slice(0, count)
          : [
              ...current.tables,
              ...makeTables(
                current.prefix,
                count - current.tables.length,
                seats,
                current.tables.length + 1,
              ),
            ],
    }));
  }

  function setPrefix(section: OnboardingSectionDraft, prefix: string): void {
    updateSection(section.key, (current) => ({
      ...current,
      prefix,
      tables: current.tables.map((table, index) => ({ ...table, number: `${prefix}${index + 1}` })),
    }));
  }

  function setSeats(section: OnboardingSectionDraft, seats: string): void {
    updateSection(section.key, (current) => ({
      ...current,
      tables: current.tables.map((table) => ({ ...table, capacity: seats })),
    }));
  }

  const totals = floor.sections.reduce(
    (sum, section) => ({
      tables: sum.tables + section.tables.length,
      seats: sum.seats + section.tables.reduce((s, t) => s + (Number(t.capacity) || 0), 0),
    }),
    { tables: 0, seats: 0 },
  );

  const reasons =
    floor.cancellationReasons ??
    BILL_CANCELLATION_REASON_DEFAULTS.map((reason) => ({ key: reason.code, ...reason }));

  async function onContinue(): Promise<void> {
    if (!complete) return;
    setStepData('floor', floor);
    await nav.next();
  }

  return (
    <Shell
      step="floor"
      title="Floor & tables"
      description="Add your dining sections and generate tables in bulk. This is what your live floor board shows. Skip it and the floor board stays empty until you add tables."
      complete={complete}
      hint={hint}
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        primary: (
          <Button
            className="h-11 px-5"
            onClick={() => void onContinue()}
            disabled={!complete || nav.busy}
          >
            Save and continue
          </Button>
        ),
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-neutral-700">Quick add:</span>
        {QUICK_SECTIONS.map((quick) => (
          <button
            key={quick.name}
            type="button"
            onClick={() => addSection(quick.name, quick.prefix)}
            className="h-11 rounded-full border border-dashed border-neutral-300 bg-white px-4 text-sm font-medium hover:border-neutral-500"
          >
            + {quick.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => addSection('', 'S')}
          className="h-11 rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium hover:border-neutral-500"
        >
          + Custom section
        </button>
      </div>

      {floor.sections.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
          Pick a section above to start. Each one generates its tables for you.
        </p>
      )}

      {floor.sections.map((section, sectionIndex) => {
        const sectionError = errors[`sections.${sectionIndex}.name`];
        const tablesError = errors[`sections.${sectionIndex}.tables`];
        return (
          <section
            key={section.key}
            aria-label={section.name || `Section ${sectionIndex + 1}`}
            className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field
                className="min-w-[180px] flex-[2_1_200px]"
                data-invalid={Boolean(sectionError)}
              >
                <FieldLabel htmlFor={`sec-${section.key}`}>Section name</FieldLabel>
                <Input
                  id={`sec-${section.key}`}
                  className="h-11 font-semibold"
                  value={section.name}
                  placeholder="e.g. Terrace"
                  aria-invalid={Boolean(sectionError)}
                  onChange={(event) =>
                    updateSection(section.key, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="flex-[1_1_90px]">
                <FieldLabel htmlFor={`pre-${section.key}`}>Table prefix</FieldLabel>
                <Input
                  id={`pre-${section.key}`}
                  className="h-11"
                  value={section.prefix}
                  maxLength={10}
                  onChange={(event) => setPrefix(section, event.target.value.toUpperCase())}
                />
              </Field>
              <Field className="flex-[1_1_90px]">
                <FieldLabel htmlFor={`cnt-${section.key}`}>Tables</FieldLabel>
                <Input
                  id={`cnt-${section.key}`}
                  className="h-11"
                  type="number"
                  min={0}
                  max={ONBOARDING_MAX_TABLES_PER_SECTION}
                  value={section.tables.length}
                  onChange={(event) => setCount(section, event.target.value)}
                />
              </Field>
              <Field className="flex-[1_1_90px]">
                <FieldLabel htmlFor={`seat-${section.key}`}>Seats each</FieldLabel>
                <Input
                  id={`seat-${section.key}`}
                  className="h-11"
                  type="number"
                  min={1}
                  max={ONBOARDING_MAX_TABLE_CAPACITY}
                  placeholder="Mixed"
                  value={sharedSeats(section)}
                  onChange={(event) => setSeats(section, event.target.value)}
                />
              </Field>
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11"
                aria-label={`Remove ${section.name || 'section'}`}
                onClick={() =>
                  save({ sections: floor.sections.filter((item) => item.key !== section.key) })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            {sectionError && <FieldError>{sectionError}</FieldError>}

            <div className="flex flex-col gap-2">
              <span className="text-xs text-neutral-600">
                {tableSummary(section)} · tap a table to change its number or seats
              </span>
              <div className="flex flex-wrap gap-2">
                {section.tables.map((table, tableIndex) => {
                  const tileError =
                    errors[`sections.${sectionIndex}.tables.${tableIndex}.number`] ??
                    errors[`sections.${sectionIndex}.tables.${tableIndex}.capacity`];
                  return (
                    <button
                      key={table.key}
                      type="button"
                      title={tileError}
                      aria-label={`Table ${table.number || 'without a number'}, ${table.capacity || '?'} seats${tileError ? `. ${tileError}` : ''}`}
                      onClick={() => setEditing({ sectionKey: section.key, table })}
                      className={`flex h-14 min-w-16 flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 ${
                        tileError
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <span className="text-sm font-bold">{table.number || '—'}</span>
                      <span className="text-[11px]">{table.capacity || '?'} seats</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-label={`Add one table to ${section.name || 'this section'}`}
                  disabled={section.tables.length >= ONBOARDING_MAX_TABLES_PER_SECTION}
                  onClick={() => setCount(section, String(section.tables.length + 1))}
                  className="flex h-14 w-16 items-center justify-center rounded-[10px] border border-dashed border-neutral-400 bg-white text-neutral-600 hover:border-neutral-600 disabled:opacity-50"
                >
                  <Plus aria-hidden />
                </button>
              </div>
              {(tablesError ||
                Object.keys(errors).some((path) =>
                  path.startsWith(`sections.${sectionIndex}.tables.`),
                )) && (
                <FieldError>
                  {tablesError ??
                    Object.entries(errors).find(([path]) =>
                      path.startsWith(`sections.${sectionIndex}.tables.`),
                    )?.[1]}
                </FieldError>
              )}
            </div>
          </section>
        );
      })}

      {floor.sections.length > 0 && (
        <p className="flex flex-wrap justify-end gap-6 text-sm text-neutral-700">
          <span>
            <strong className="text-neutral-900">{floor.sections.length}</strong>{' '}
            {floor.sections.length === 1 ? 'section' : 'sections'}
          </span>
          <span>
            <strong className="text-neutral-900">{totals.tables}</strong>{' '}
            {totals.tables === 1 ? 'table' : 'tables'}
          </span>
          <span>
            <strong className="text-neutral-900">{totals.seats}</strong> seats
          </span>
        </p>
      )}

      <Section
        title="Table statuses"
        description="These four run the floor board, orders and billing, so they're always added. You can rename them later."
        action={
          <Button
            variant="outline"
            className="h-11"
            onClick={() =>
              save({ customStatuses: [...floor.customStatuses, { key: newKey(), name: '' }] })
            }
          >
            <Plus aria-hidden />
            Custom status
          </Button>
        }
      >
        <ul className="flex flex-wrap gap-2">
          {SYSTEM_STATUSES.map((status) => (
            <li
              key={status.name}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium"
            >
              <span className={`size-2 rounded-full ${status.color}`} aria-hidden />
              {status.name}
              <Lock className="size-3 text-neutral-500" aria-label="System status" />
            </li>
          ))}
        </ul>
        {floor.customStatuses.map((status, index) => {
          const error = errors[`customStatuses.${index}.name`];
          return (
            <Field key={status.key} data-invalid={Boolean(error)}>
              <div className="flex items-center gap-2">
                <Input
                  className="h-11"
                  aria-label={`Custom status ${index + 1}`}
                  placeholder="e.g. Deep clean"
                  value={status.name}
                  aria-invalid={Boolean(error)}
                  onChange={(event) =>
                    save({
                      customStatuses: floor.customStatuses.map((item) =>
                        item.key === status.key ? { ...item, name: event.target.value } : item,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  className="size-11"
                  aria-label={`Remove custom status ${status.name || index + 1}`}
                  onClick={() =>
                    save({
                      customStatuses: floor.customStatuses.filter(
                        (item) => item.key !== status.key,
                      ),
                    })
                  }
                >
                  <X aria-hidden />
                </Button>
              </div>
              <FieldError>{error}</FieldError>
            </Field>
          );
        })}
      </Section>

      <Section
        title="Bill cancellation reasons"
        description={
          editingReasons
            ? 'Cashiers pick one of these when they cancel a bill.'
            : `${BILL_CANCELLATION_REASON_DEFAULTS.length} defaults will be added: ${BILL_CANCELLATION_REASON_DEFAULTS.map(({ name }) => name).join(', ')}.`
        }
        action={
          editingReasons ? (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => {
                setEditingReasons(false);
                const { cancellationReasons: _reasons, ...rest } = floor;
                setStepData('floor', rest);
              }}
            >
              Use defaults
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setEditingReasons(true);
                save({ cancellationReasons: reasons });
              }}
            >
              Edit list
            </Button>
          )
        }
      >
        {editingReasons && (
          <div className="flex flex-col gap-2">
            {reasons.map((reason, index) => {
              const error = errors[`cancellationReasons.${index}.name`];
              return (
                <Field key={reason.key} data-invalid={Boolean(error)}>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-11"
                      aria-label={`Cancellation reason ${index + 1}`}
                      value={reason.name}
                      aria-invalid={Boolean(error)}
                      onChange={(event) =>
                        save({
                          cancellationReasons: reasons.map((item) =>
                            item.key === reason.key ? { ...item, name: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      className="size-11"
                      aria-label={`Remove ${reason.name || 'reason'}`}
                      disabled={reasons.length === 1}
                      onClick={() =>
                        save({
                          cancellationReasons: reasons.filter((item) => item.key !== reason.key),
                        })
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  <FieldError>{error}</FieldError>
                </Field>
              );
            })}
            <Button
              variant="outline"
              className="h-11 self-start"
              onClick={() =>
                save({ cancellationReasons: [...reasons, { key: newKey(), name: '' }] })
              }
            >
              <Plus aria-hidden />
              Add reason
            </Button>
            <FieldError>{errors.cancellationReasons}</FieldError>
          </div>
        )}
      </Section>

      <TileDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(table) => {
          if (!editing) return;
          updateSection(editing.sectionKey, (section) => ({
            ...section,
            tables: section.tables.map((item) => (item.key === table.key ? table : item)),
          }));
          setEditing(null);
        }}
        onRemove={() => {
          if (!editing) return;
          updateSection(editing.sectionKey, (section) => ({
            ...section,
            tables: section.tables.filter((item) => item.key !== editing.table.key),
          }));
          setEditing(null);
        }}
      />
    </Shell>
  );
}

function TileDialog({
  editing,
  onClose,
  onSave,
  onRemove,
}: {
  editing: EditingTile | null;
  onClose: () => void;
  onSave: (table: OnboardingTableDraft) => void;
  onRemove: () => void;
}): ReactElement {
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (editing && openedFor !== editing.table.key) {
    setOpenedFor(editing.table.key);
    setNumber(editing.table.number);
    setCapacity(editing.table.capacity);
  }

  return (
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit table</DialogTitle>
          <DialogDescription>Table numbers must be unique across the restaurant.</DialogDescription>
        </DialogHeader>
        <form
          id="tile-form"
          className="grid grid-cols-2 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (editing)
              onSave({ ...editing.table, number: number.trim(), capacity: capacity.trim() });
          }}
        >
          <Field>
            <FieldLabel htmlFor="tile-number">Table number</FieldLabel>
            <Input
              id="tile-number"
              className="h-11"
              value={number}
              maxLength={50}
              onChange={(event) => setNumber(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="tile-seats">Seats</FieldLabel>
            <Input
              id="tile-seats"
              className="h-11"
              type="number"
              min={1}
              max={ONBOARDING_MAX_TABLE_CAPACITY}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="h-11 text-red-700" onClick={onRemove}>
            Remove table
          </Button>
          <Button type="submit" form="tile-form" className="h-11 px-5">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
