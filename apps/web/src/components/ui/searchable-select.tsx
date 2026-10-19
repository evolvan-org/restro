'use client';

import 'tom-select/dist/css/tom-select.default.css';

import { cn } from 'cn';
import { type ReactElement, useEffect, useRef } from 'react';
import TomSelect from 'tom-select';

export type SearchableSelectOption = { value: string; label: string };

export type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Single-select dropdown with type-to-search, powered by Tom Select with its default styling.
 * Controlled: `value`/`onChange` mirror a native select.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  id,
  'aria-label': ariaLabel,
  'aria-invalid': invalid = false,
  disabled = false,
  className,
}: SearchableSelectProps): ReactElement {
  const selectRef = useRef<HTMLSelectElement>(null);
  const instanceRef = useRef<TomSelect | null>(null);
  const onChangeRef = useRef(onChange);
  const latest = useRef({ options, value });

  useEffect(() => {
    onChangeRef.current = onChange;
    latest.current = { options, value };
  });

  useEffect(() => {
    const element = selectRef.current;
    if (!element) return;

    const instance = new TomSelect(element, {
      maxItems: 1,
      create: false,
      allowEmptyOption: true,
      placeholder,
      valueField: 'value',
      labelField: 'label',
      searchField: ['label'],
      sortField: [{ field: '$order' }],
      options: latest.current.options.map((option) => ({ ...option })),
      items: latest.current.value ? [latest.current.value] : [],
      onChange: (next: string) => onChangeRef.current(next),
    });
    instanceRef.current = instance;

    if (ariaLabel) instance.control_input.setAttribute('aria-label', ariaLabel);

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
    // The instance is created once; props are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the option list in sync (e.g. once the stock list loads or rows hide taken ingredients).
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const wanted = new Set(options.map((option) => option.value));
    for (const existing of Object.keys(instance.options)) {
      if (!wanted.has(existing)) instance.removeOption(existing, true);
    }
    instance.addOptions(options.map((option) => ({ ...option })));
    instance.refreshOptions(false);
    if (instance.getValue() !== value) instance.setValue(value, true);
  }, [options, value]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (disabled) instance.disable();
    else instance.enable();
  }, [disabled]);

  return (
    <div className={cn('w-full', invalid && '[&_.ts-control]:!border-destructive', className)}>
      <select ref={selectRef} id={id} />
    </div>
  );
}
