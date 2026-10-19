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
  /** Focus and open the dropdown as soon as it mounts. */
  autoOpen?: boolean;
  /** Attach the option list to `body` so clipping ancestors (scroll containers) can't hide it. */
  dropdownInBody?: boolean;
  /** Called whenever the dropdown closes (after a pick, Escape or clicking away). */
  onClose?: () => void;
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
  autoOpen = false,
  dropdownInBody = false,
  onClose,
}: SearchableSelectProps): ReactElement {
  const selectRef = useRef<HTMLSelectElement>(null);
  const instanceRef = useRef<TomSelect | null>(null);
  const onChangeRef = useRef(onChange);
  const onCloseRef = useRef(onClose);
  const latest = useRef({ options, value });

  useEffect(() => {
    onChangeRef.current = onChange;
    onCloseRef.current = onClose;
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
      ...(dropdownInBody && { dropdownParent: 'body' }),
      onDropdownClose: () => onCloseRef.current?.(),
    });
    instanceRef.current = instance;
    let reposition: (() => void) | null = null;
    if (dropdownInBody) {
      // Tom Select anchors a body-level list once on open; keep it glued to the control while
      // layout settles and while any ancestor (e.g. the table's scroll container) scrolls.
      instance.dropdown.style.margin = '0';
      reposition = (): void => instance.positionDropdown();
      instance.on('dropdown_open', () => {
        requestAnimationFrame(() => instance.positionDropdown());
        window.addEventListener('scroll', reposition!, true);
        window.addEventListener('resize', reposition!);
      });
      instance.on('dropdown_close', () => {
        window.removeEventListener('scroll', reposition!, true);
        window.removeEventListener('resize', reposition!);
      });
    }
    if (autoOpen) instance.focus();

    if (ariaLabel) instance.control_input.setAttribute('aria-label', ariaLabel);

    return () => {
      if (reposition) {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      }
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
