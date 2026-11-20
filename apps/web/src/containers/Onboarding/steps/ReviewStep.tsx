'use client';

import {
  findInventoryRowIssues,
  findMenuRowIssues,
  summarizeMenuCategories,
} from '@rms/api-contract';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';

import { plural } from '../format';
import { useOnboarding } from '../OnboardingProvider';
import { stepStatus } from '../progress';
import Shell from '../Shell';
import { stepPath, STEPS } from '../steps';
import { useStepNavigation } from '../useStepNavigation';

function SummaryCard({
  step,
  title,
  skipped,
  children,
}: {
  step: string;
  title: string;
  skipped: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {skipped ? (
          <p className="text-sm text-amber-800">Skipped · you can do this from the dashboard</p>
        ) : (
          <div className="flex flex-col gap-1 text-sm text-neutral-700">{children}</div>
        )}
      </div>
      <Link
        href={`${stepPath(step as never)}?from=review`}
        className="inline-flex min-h-11 flex-none items-center text-sm font-semibold hover:underline"
        aria-label={`Edit ${title}`}
      >
        Edit
      </Link>
    </section>
  );
}

export default function ReviewStep(): ReactElement {
  const router = useRouter();
  const { draft, server, flush } = useOnboarding();
  const nav = useStepNavigation('review');
  const [finishing, setFinishing] = useState(false);
  const { data } = draft;

  const skipped = (step: (typeof STEPS)[number]['step']): boolean =>
    stepStatus(draft, step) === 'skipped';
  const details = data.details;
  const sections = data.floor?.sections ?? [];
  const tableCount = sections.reduce((n, s) => n + s.tables.length, 0);
  const menuRows = data.menu?.mode === 'later' ? [] : (data.menu?.rows ?? []);
  const inventoryRows = data.inventory?.rows ?? [];
  const members = (data.team?.members ?? []).filter((m) => m.name.trim() || m.email.trim());
  const problems =
    findMenuRowIssues(menuRows).length + findInventoryRowIssues(inventoryRows).length;

  async function finish(): Promise<void> {
    setFinishing(true);
    await flush();
    router.push('/onboarding/finishing');
  }

  return (
    <Shell
      step="review"
      title="Review and finish"
      description="Nothing has been created yet. When you finish, we set up everything below in one go."
      footer={{ onBack: nav.back, primary: null }}
    >
      <SummaryCard step="details" title="Restaurant details" skipped={skipped('details')}>
        <p>{details?.name.trim() || server.restaurant.name}</p>
        <p>
          GST {details?.defaultGstRate ?? server.restaurant.defaultGstRate}%
          {details?.gstNumber ? ` · GSTIN ${details.gstNumber}` : ' · no GSTIN yet'} ·{' '}
          {details?.currency ?? server.restaurant.currency}
        </p>
      </SummaryCard>
      <SummaryCard step="floor" title="Floor & tables" skipped={skipped('floor')}>
        <p>
          {plural(sections.length, 'section')} · {plural(tableCount, 'table')}
        </p>
        {sections.length > 0 && <p>{sections.map((s) => s.name || 'Unnamed').join(', ')}</p>}
      </SummaryCard>
      <SummaryCard step="menu" title="Menu" skipped={skipped('menu') || menuRows.length === 0}>
        <p>
          {plural(menuRows.length, 'item')} in{' '}
          {plural(summarizeMenuCategories(menuRows).length, 'category', 'categories')}
        </p>
        <p>Created without recipes. The dashboard will remind you to add them.</p>
      </SummaryCard>
      <SummaryCard
        step="inventory"
        title="Inventory"
        skipped={skipped('inventory') || inventoryRows.length === 0}
      >
        <p>
          {plural(inventoryRows.length, 'ingredient')} ·{' '}
          {inventoryRows.filter((r) => r.openingQuantity.trim()).length} with opening stock
        </p>
      </SummaryCard>
      <SummaryCard step="team" title="Team" skipped={skipped('team') || members.length === 0}>
        <p>{plural(members.length, 'person', 'people')}</p>
        <p>Invitations are emailed when setup finishes.</p>
      </SummaryCard>

      <section className="flex flex-col gap-4 rounded-xl bg-neutral-900 p-6 text-white">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Ready to open {server.restaurant.name}?</h2>
          <p className="text-sm text-neutral-300">
            This takes a few seconds. If anything fails, nothing is half-created: you&apos;ll see
            what went wrong and can retry.
          </p>
        </div>
        {problems > 0 && (
          <p className="text-sm text-amber-300">
            Some rows still need fixing. Use Edit on Menu or Inventory first.
          </p>
        )}
        <Button
          className="h-12 self-start bg-white px-6 text-neutral-900 hover:bg-neutral-100"
          disabled={finishing || problems > 0}
          onClick={() => void finish()}
        >
          {finishing ? 'Starting…' : 'Finish restaurant setup'}
        </Button>
      </section>
    </Shell>
  );
}
