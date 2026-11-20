import { BarChart3 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

type ReportingPaneProps = {
  /**
   * Report widgets. When nothing is mounted the pane shows its empty state, which
   * keeps this story independent of the report content.
   */
  children?: ReactNode;
};

export default function ReportingPane({ children }: ReportingPaneProps): ReactElement {
  const hasWidgets = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

  if (hasWidgets) {
    return <div className="space-y-6">{children}</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
      <BarChart3 className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-base font-medium">No reports yet</p>
      <p className="text-sm text-muted-foreground">
        Business reports will appear here once they are available.
      </p>
    </div>
  );
}
