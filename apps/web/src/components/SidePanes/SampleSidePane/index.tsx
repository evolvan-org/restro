'use client';

import { Button } from '@/components/ui/button';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/** Props come from `showSidePane(SidePaneType.Sample, payload)`, plus `onCancel`. */
export type SampleSidePaneProps = {
  title?: string;
  onCancel?: () => void;
};

/**
 * Content-only pane rendered inside the shadcn `Sheet` that the `SidePane`
 * container provides. Uses the sheet's header/footer primitives; `onCancel`
 * closes the drawer.
 */
export default function SampleSidePane({
  title = 'Sample side pane',
  onCancel,
}: SampleSidePaneProps) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>
          This pane is rendered by the Redux-driven <code>SidePane</code> container. Open it from
          anywhere with <code>useShowSampleSidePane()</code>.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 px-4 text-sm text-muted-foreground">Pane body goes here.</div>

      <SheetFooter>
        <Button variant="outline" onClick={onCancel}>
          Close
        </Button>
      </SheetFooter>
    </>
  );
}
