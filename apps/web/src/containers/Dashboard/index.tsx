'use client';

import { Permission } from '@rms/permissions';
import type { ReactElement } from 'react';

import {
  SegmentedControl,
  type SegmentedOption,
  segmentedPanelId,
  segmentedTabId,
} from '@/components/ui/segmented-control';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import usePersistedState from '@/hooks/usePersistedState';
import { useProfile } from '@/services/api/requests/profile';

import FloorBoard from '../FloorBoard';
import ReportingPane from './ReportingPane';
import Reports from './Reports';
import SetupPrompts from './SetupPrompts';
import TodaySummary from './TodaySummary';

type DashboardView = 'live' | 'reporting';

const VIEW_STORAGE_KEY = 'rms-dashboard-view';
const VIEW_ID_BASE = 'dashboard-view';
const VIEWS: readonly SegmentedOption<DashboardView>[] = [
  { value: 'live', label: 'Live Floor View' },
  { value: 'reporting', label: 'Reporting' },
];
const VIEW_VALUES: readonly DashboardView[] = VIEWS.map((view) => view.value);

function DashboardContent({ storageKey }: { storageKey: string }): ReactElement {
  const [storedView, setView, isViewRestored] = usePersistedState(storageKey, 'live', VIEW_VALUES);
  const { can } = usePermissions();
  const canReport = can(Permission.REPORT_READ);
  // Roles without report access only ever see the live floor, whatever view was stored.
  const view: DashboardView = canReport ? storedView : 'live';
  const isLive = view === 'live';

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-muted/35">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-4 sm:px-6 sm:pt-6 xl:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px]">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of today&apos;s service
          </p>
        </div>
        {canReport && (
          <SegmentedControl
            idBase={VIEW_ID_BASE}
            aria-label="Dashboard view"
            options={VIEWS}
            value={view}
            onChange={setView}
            className="w-full rounded-xl border sm:w-fit [&>button]:flex-1 [&>button]:justify-center sm:[&>button]:flex-none"
          />
        )}
      </header>
      <SetupPrompts />

      <div
        role="tabpanel"
        id={segmentedPanelId(VIEW_ID_BASE, 'live')}
        aria-labelledby={segmentedTabId(VIEW_ID_BASE, 'live')}
        className="flex-1 border-t bg-background"
        hidden={!isLive}
      >
        {isViewRestored && isLive && <FloorBoard />}
      </div>
      <div
        role="tabpanel"
        id={segmentedPanelId(VIEW_ID_BASE, 'reporting')}
        aria-labelledby={segmentedTabId(VIEW_ID_BASE, 'reporting')}
        className="flex-1 px-4 pt-2 pb-6 sm:px-6 xl:px-8"
        hidden={isLive}
      >
        {isViewRestored && canReport && !isLive && (
          <ReportingPane>
            <TodaySummary />
            <Reports />
          </ReportingPane>
        )}
      </div>
    </div>
  );
}

export default function Dashboard(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.DASHBOARD_READ]);
  const { data: profile } = useProfile();

  if (!isAllowed || !profile) return null;

  return (
    <DashboardContent key={profile.email} storageKey={`${VIEW_STORAGE_KEY}:${profile.email}`} />
  );
}
