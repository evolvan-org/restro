export type SettingsNavItem = {
  label: string;
  href: string;
};

export type SettingsNavGroup = {
  label: string;
  items: readonly SettingsNavItem[];
};

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: 'RESTAURANT',
    items: [
      { label: 'General', href: '/restaurant/settings/general' },
      { label: 'Team', href: '/restaurant/settings/team' },
    ],
  },
  {
    label: 'FLOOR SETUP',
    items: [
      { label: 'Dining sections', href: '/restaurant/settings/dining-sections' },
      { label: 'Tables', href: '/restaurant/settings/tables' },
      { label: 'Table statuses', href: '/restaurant/settings/table-statuses' },
    ],
  },
  {
    label: 'MENU',
    items: [{ label: 'Menu categories', href: '/restaurant/settings/menu-categories' }],
  },
  {
    label: 'BILLING',
    items: [
      { label: 'Tax & discounts', href: '/restaurant/settings/tax-discounts' },
      { label: 'Cancellation reasons', href: '/restaurant/settings/cancellation-reasons' },
    ],
  },
];
