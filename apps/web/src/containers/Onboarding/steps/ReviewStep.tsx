'use client';

import {
  findInventoryRowIssues,
  findMenuRowIssues,
  findRecipeIssues,
  formatInr,
  includedMenuRows,
  type OnboardingStep,
  parseDecimal,
  summarizeMenuCategories,
} from '@rms/api-contract';
import { ArrowRight, Info, Sparkles, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useState } from 'react';

import { AiSuggestedChip, ApprovedChip, PriceSourceChip } from '@/components/AiScan/markers';

import { useOnboarding } from '../OnboardingProvider';
import { stepStatus } from '../progress';
import { recipeMenuRows } from '../recipe-ingredients';
import Shell from '../Shell';
import { stepPath } from '../steps';
import { Alert, btn, Card, Chip } from '../ui/kit';
import { useStepNavigation } from '../useStepNavigation';

type SectionState = 'ready' | 'todo' | 'skipped';

function Kv({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'bad';
}): ReactElement {
  return (
    <div className="flex justify-between gap-3 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <b
        className={tone === 'bad' ? 'text-red-700 tabular-nums dark:text-red-400' : 'tabular-nums'}
      >
        {value}
      </b>
    </div>
  );
}

function SectionCard({
  step,
  title,
  state,
  isNew,
  children,
}: {
  step: OnboardingStep;
  title: string;
  state: SectionState;
  isNew?: boolean;
  children: ReactNode;
}): ReactElement {
  const cta = state === 'ready' ? 'Edit' : state === 'todo' ? 'Do now' : 'Add';
  return (
    <Card as="section" className="flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {state === 'ready' ? (
            <ApprovedChip label="Ready" />
          ) : state === 'todo' ? (
            <Chip tone="edit">To do</Chip>
          ) : (
            <Chip>Skipped</Chip>
          )}
          {isNew && <Chip tone="ai">New</Chip>}
        </div>
        <Link
          href={`${stepPath(step)}?from=review`}
          className={btn('ghost', 'sm')}
          aria-label={`${cta}: ${title}`}
        >
          {cta}
        </Link>
      </div>
      {children}
    </Card>
  );
}

/** Review & finish (board "Review and finish"): every section with its state; nothing is live yet. */
export default function ReviewStep(): ReactElement {
  const router = useRouter();
  const { draft, server, flush } = useOnboarding();
  const nav = useStepNavigation('review');
  const [finishing, setFinishing] = useState(false);
  const { data } = draft;

  const skipped = (step: OnboardingStep): boolean => stepStatus(draft, step) === 'skipped';
  const deferred = (step: OnboardingStep): boolean =>
    Boolean(data.deferred?.includes(step as never));
  const state = (step: OnboardingStep, filled: boolean): SectionState =>
    skipped(step) ? 'skipped' : filled && !deferred(step) ? 'ready' : 'todo';

  const details = data.details;
  const sections = data.floor?.sections ?? [];
  const tableCount = sections.reduce((n, s) => n + s.tables.length, 0);
  const menuRows =
    skipped('menu') || data.menu?.mode === 'later' ? [] : includedMenuRows(data.menu?.rows ?? []);
  const fromPhoto = menuRows.some((row) => row.ai);
  const diets = { VEG: 0, NON_VEG: 0, EGG: 0 };
  for (const row of menuRows) if (row.dietType) diets[row.dietType] += 1;

  const recipeRows = new Map(recipeMenuRows(data, skipped('menu')).map((row) => [row.key, row]));
  const dishes = skipped('recipes')
    ? []
    : (data.recipes?.dishes ?? []).filter((dish) => recipeRows.has(dish.menuRowKey));
  const withRecipe = dishes.filter((dish) => dish.status !== 'no-recipe' && dish.lines.length > 0);
  const recipeIngredients = new Set(
    withRecipe.flatMap((dish) => dish.lines.map((line) => line.ingredient.trim().toLowerCase())),
  );
  const drafts = dishes.filter((dish) => dish.status === 'draft').length;

  const inventoryRows = skipped('inventory') ? [] : (data.inventory?.rows ?? []);
  const withStock = inventoryRows.filter((row) => row.openingQuantity.trim());
  const stockValue = withStock.reduce(
    (sum, row) =>
      sum + (parseDecimal(row.openingQuantity) ?? 0) * (parseDecimal(row.openingUnitCost) ?? 0),
    0,
  );
  const invoices = (data.inventory?.invoices ?? []).filter((invoice) => invoice.applied).length;
  const fromInvoice = inventoryRows.filter((row) => row.costSource === 'invoice').length;
  const members = skipped('team')
    ? []
    : (data.team?.members ?? []).filter((m) => m.name.trim() || m.email.trim());

  const problems =
    findMenuRowIssues(menuRows).length +
    findInventoryRowIssues(inventoryRows).length +
    findRecipeIssues({ dishes }).length;

  async function finish(): Promise<void> {
    setFinishing(true);
    await flush();
    router.push('/onboarding/finishing');
  }

  const built = [
    menuRows.length ? 'your menu' : null,
    withRecipe.length ? `${withRecipe.length} recipes` : null,
    inventoryRows.length ? `${inventoryRows.length} ingredients` : null,
    tableCount ? `${tableCount} tables` : null,
  ].filter(Boolean);

  return (
    <Shell
      step="review"
      title="Review & finish"
      description="Check each section. Edit anything before you build."
      width="wide"
      footer={{
        onBack: nav.back,
        note: 'Takes about 20 seconds',
        primary: (
          <button
            type="button"
            className={btn('primary', 'lg')}
            disabled={finishing || problems > 0}
            onClick={() => void finish()}
          >
            {finishing ? 'Starting…' : 'Build my restaurant'}
            <ArrowRight aria-hidden />
          </button>
        ),
      }}
    >
      <Alert tone="ai" icon={<Info aria-hidden />} className="items-center">
        <span className="text-sm">
          <b>Nothing is live yet.</b> Pressing Build creates{' '}
          {built.length ? built.join(', ') : 'your restaurant'} in one go.
          {fromPhoto || withRecipe.length
            ? ' Every AI suggestion is one you reviewed, accepted or kept as a draft.'
            : ''}
        </span>
      </Alert>
      {problems > 0 && (
        <Alert tone="bad" role="alert" icon={<TriangleAlert aria-hidden />}>
          <b>
            {problems} row{problems === 1 ? ' needs' : 's need'} fixing
          </b>{' '}
          before you can build. Use Edit on Menu, Recipes or Inventory.
        </Alert>
      )}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard
          step="details"
          title="Restaurant details"
          state={state('details', Boolean(details))}
        >
          {details && !deferred('details') ? (
            <>
              <Kv label="Name" value={details.name.trim() || server.restaurant.name} />
              <Kv label="GSTIN" value={details.gstNumber || 'Not yet'} />
              <Kv label="Default GST" value={`${details.defaultGstRate}%`} />
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              Address, GSTIN and GST rate are not filled in yet. You can finish them after setup.
            </p>
          )}
        </SectionCard>
        <SectionCard
          step="floor"
          title="Floor & tables"
          state={state('floor', sections.length > 0)}
        >
          {sections.length && !deferred('floor') ? (
            <>
              <Kv label="Sections" value={sections.length} />
              <Kv label="Tables" value={tableCount} />
              <p className="truncate text-[13px] text-muted-foreground">
                {sections.map((s) => s.name || 'Unnamed').join(', ')}
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              No sections or tables yet. Add them from the floor board.
            </p>
          )}
        </SectionCard>
        <SectionCard step="menu" title="Menu" state={state('menu', menuRows.length > 0)}>
          {menuRows.length ? (
            <>
              <Kv label="Dishes" value={menuRows.length} />
              <Kv label="Categories" value={summarizeMenuCategories(menuRows).length} />
              <Kv
                label="Veg · Non-veg · Egg"
                value={`${diets.VEG} · ${diets.NON_VEG} · ${diets.EGG}`}
              />
              {menuRows.some((row) => row.variants?.length) && (
                <Kv
                  label="With Half / Full"
                  value={menuRows.filter((row) => row.variants?.length).length}
                />
              )}
              {fromPhoto && (
                <div>
                  <AiSuggestedChip label="Read from photo, you reviewed it" />
                </div>
              )}
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              No menu yet. Captains can&apos;t take orders until there is one.
            </p>
          )}
        </SectionCard>
        <SectionCard
          step="recipes"
          title="Recipes"
          state={state('recipes', withRecipe.length > 0)}
          isNew
        >
          {withRecipe.length ? (
            <>
              <Kv label="Recipes" value={`${withRecipe.length} of ${menuRows.length} dishes`} />
              <Kv label="Ingredients" value={recipeIngredients.size} />
              {drafts > 0 && (
                <Alert
                  tone="ai"
                  icon={<Sparkles aria-hidden />}
                  className="px-2.5 py-2 text-[12.5px]"
                >
                  {drafts} AI draft{drafts === 1 ? '' : 's'} not approved yet: saved and marked
                  &quot;not yet reviewed&quot;.
                </Alert>
              )}
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              No recipes yet. Dishes without one show on the dashboard.
            </p>
          )}
        </SectionCard>
        <SectionCard
          step="inventory"
          title="Inventory"
          state={state('inventory', inventoryRows.length > 0)}
        >
          {inventoryRows.length ? (
            <>
              <Kv label="Ingredients" value={inventoryRows.length} />
              <Kv label="With opening stock" value={withStock.length} />
              <Kv label="Opening stock value" value={formatInr(stockValue)} />
              {invoices > 0 && (
                <div>
                  <PriceSourceChip
                    source="invoice"
                    label={`${fromInvoice} costs from ${invoices} invoice${invoices === 1 ? '' : 's'}`}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              No ingredients yet. Add them from Inventory after setup.
            </p>
          )}
        </SectionCard>
        <SectionCard step="team" title="Team" state={state('team', members.length > 0)}>
          {members.length ? (
            <>
              <Kv label="People" value={members.length} />
              <p className="text-[13px] text-muted-foreground">
                Invitations are emailed when setup finishes.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              Skipped. Invite your team from Settings.
            </p>
          )}
        </SectionCard>
      </div>
    </Shell>
  );
}
