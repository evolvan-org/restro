'use client';

import { type ComponentType, Fragment } from 'react';

import SampleSidePane from '@/components/SidePanes/SampleSidePane';
import StaffFormSidePane from '@/components/SidePanes/StaffFormSidePane';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useHideSidePane, useSidePanePayload, useSidePaneType } from '@/store/hooks/sidepane';
import { SidePaneType } from '@/store/types/sidepane';

/**
 * Maps each `SidePaneType` to the component that renders it. Add an entry here
 * when you add a pane — the container looks it up by the type in Redux and
 * renders it with the payload from `showSidePane(type, payload)`, plus an
 * `onCancel` that closes the pane. The shadcn `Sheet` provides the drawer
 * chrome and animation; panes are content-only.
 */
const SIDE_PANES: Partial<Record<SidePaneType, ComponentType<any>>> = {
  [SidePaneType.None]: Fragment,
  [SidePaneType.Sample]: SampleSidePane,
  [SidePaneType.StaffForm]: StaffFormSidePane,
};

/** Single mount point for every side pane — a right-hand slide-in drawer. */
export default function SidePane() {
  const sidePaneType = useSidePaneType();
  const sidePanePayload = useSidePanePayload();
  const hideSidePane = useHideSidePane();

  const SelectedSidePane: ComponentType<any> = SIDE_PANES[sidePaneType] ?? Fragment;

  return (
    <Sheet
      open={!!sidePaneType}
      onOpenChange={(open) => {
        if (!open) hideSidePane();
      }}
    >
      <SheetContent side="right" className="w-screen sm:max-w-md">
        {SelectedSidePane !== Fragment ? (
          <SelectedSidePane {...sidePanePayload} onCancel={hideSidePane} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
