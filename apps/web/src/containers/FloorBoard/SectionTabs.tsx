'use client';

import { cn } from 'cn';
import type { ReactElement } from 'react';

type SectionOption = { id: string; name: string; count: number };

type SectionTabsProps = {
  sections: readonly SectionOption[];
  total: number;
  activeSectionId: string;
  onChange: (sectionId: string) => void;
};

function Tab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 text-sm transition-colors',
        active
          ? 'border-neutral-900 font-semibold text-foreground dark:border-neutral-100'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className="text-xs text-neutral-400 tabular-nums">{count}</span>
    </button>
  );
}

export default function SectionTabs(props: SectionTabsProps): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Filter by section"
      className="flex items-center gap-5 overflow-x-auto px-6 xl:px-8"
    >
      <Tab
        active={props.activeSectionId === ''}
        label="All sections"
        count={props.total}
        onClick={() => props.onChange('')}
      />
      {props.sections.map((section) => (
        <Tab
          key={section.id}
          active={props.activeSectionId === section.id}
          label={section.name}
          count={section.count}
          onClick={() => props.onChange(section.id)}
        />
      ))}
    </div>
  );
}
