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
import usePersistedState from '@/hooks/usePersistedState';

import FloorBoard from '../FloorBoard';
import ReportingPane from './ReportingPane';

type DashboardView = 'live' | 'reporting';

const VIEW_STORAGE_KEY = 'rms-dashboard-view';
const VIEW_ID_BASE = 'dashboard-view';
const VIEWS: readonly SegmentedOption<DashboardView>[] = [
  { value: 'live', label: 'Live Floor View' },
  { value: 'reporting', label: 'Reporting' },
];
const VIEW_VALUES: readonly DashboardView[] = VIEWS.map((view) => view.value);

export default function Dashboard(): ReactElement | null {
  // Gates the whole screen (and therefore the toggle) on `dashboard:read`.
  const isAllowed = usePermissionGuard([Permission.DASHBOARD_READ]);
  const [view, setView] = usePersistedState<DashboardView>(VIEW_STORAGE_KEY, 'live', VIEW_VALUES);

  if (!isAllowed) {
    return null;
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden">
      <div className="flex shrink-0 items-center border-b px-6 py-3 xl:px-8">
        <SegmentedControl
          idBase={VIEW_ID_BASE}
          aria-label="Dashboard view"
          options={VIEWS}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'live' ? (
        <div
          role="tabpanel"
          id={segmentedPanelId(VIEW_ID_BASE, 'live')}
          aria-labelledby={segmentedTabId(VIEW_ID_BASE, 'live')}
          className="min-h-0 flex-1"
        >
          <FloorBoard />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={segmentedPanelId(VIEW_ID_BASE, 'reporting')}
          aria-labelledby={segmentedTabId(VIEW_ID_BASE, 'reporting')}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8"
        >
          <ReportingPane />
        </div>
      )}
    </div>
  );
}
