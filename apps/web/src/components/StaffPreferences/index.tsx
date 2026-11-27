'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Globe2, type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { type ReactElement, useSyncExternalStore } from 'react';

import { localeNames, type StaffLocale, staffMessage } from './messages';

const preferenceEvent = 'restro:preferences';
const themeKey = 'restro-theme';
const localeKey = 'restro-locale';
type Theme = 'light' | 'dark' | 'system';

const themeOptions = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const;

const languageOptions = (Object.keys(localeNames) as StaffLocale[]).map((value) => ({
  value,
  label: localeNames[value],
}));

function subscribe(change: () => void): () => void {
  window.addEventListener('storage', change);
  window.addEventListener(preferenceEvent, change);
  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(preferenceEvent, change);
  };
}

function applyTheme(): void {
  const theme = getTheme();
  document.documentElement.classList.toggle(
    'dark',
    theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );
}

function getTheme(): Theme {
  const theme = document.documentElement.dataset.restroTheme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

function getLocale(): StaffLocale {
  const locale = document.documentElement.lang;
  return locale === 'es' || locale === 'fr' ? locale : 'en';
}

function updatePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the preference for the current page when storage is unavailable.
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

export function useStaffLanguage(): (message: string) => string {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en' as const);
  return (message) => staffMessage(locale, message);
}

type PreferenceOption<Value extends string> = { value: Value; label: string; icon?: LucideIcon };

function PreferencePicker<Value extends string>({
  label,
  value,
  options,
  icon: Icon,
  shortLabel,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly PreferenceOption<Value>[];
  icon: LucideIcon;
  shortLabel?: string;
  onChange: (value: Value) => void;
}): ReactElement {
  return (
    <Select.Root<Value>
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <Select.Trigger
        aria-label={label}
        className="group relative flex h-8 min-w-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Select.Value className="sr-only whitespace-nowrap sm:not-sr-only" />
        {shortLabel && (
          <span aria-hidden className="sm:hidden">
            {shortLabel}
          </span>
        )}
        <Select.Icon className="hidden text-muted-foreground transition-transform group-data-popup-open:rotate-180 sm:block">
          <ChevronDown className="size-3" aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="end"
          sideOffset={8}
          collisionPadding={12}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Select.Popup className="min-w-40 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
            <Select.Group>
              <Select.GroupLabel className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                {label}
              </Select.GroupLabel>
              {options.map(({ value: optionValue, label: optionLabel, icon: OptionIcon }) => (
                <Select.Item
                  key={optionValue}
                  value={optionValue}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium"
                >
                  {OptionIcon && (
                    <OptionIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <Select.ItemText className="flex-1">{optionLabel}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="size-4" aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Group>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export default function StaffPreferences(): ReactElement {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'system' as const);
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en' as const);
  const t = useStaffLanguage();
  const ThemeIcon = themeOptions.find((option) => option.value === theme)?.icon ?? Monitor;

  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-border/80 bg-muted/40 p-0.5">
      <PreferencePicker
        label={t('Language')}
        value={locale}
        options={languageOptions}
        icon={Globe2}
        shortLabel={locale.toUpperCase()}
        onChange={(next) => {
          document.documentElement.lang = next;
          updatePreference(localeKey, next);
        }}
      />
      <div className="h-4 w-px bg-border" aria-hidden />
      <PreferencePicker
        label={t('Theme')}
        value={theme}
        icon={ThemeIcon}
        options={themeOptions.map((option) => ({ ...option, label: t(option.label) }))}
        onChange={(next) => {
          document.documentElement.dataset.restroTheme = next;
          applyTheme();
          updatePreference(themeKey, next);
        }}
      />
    </div>
  );
}
