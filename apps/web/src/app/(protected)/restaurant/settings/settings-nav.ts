import { Permission } from '@rms/permissions';

export type SettingsNavItem = {
  label: string;
  href: string;
  /** Hidden unless the user holds this permission. */
  permission: Permission;
};

export type SettingsNavGroup = {
  label: string;
  items: readonly SettingsNavItem[];
};

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: 'RESTAURANT',
    items: [
      {
        label: 'General',
        href: '/restaurant/settings/general',
        permission: Permission.SETTINGS_READ,
      },
      { label: 'Team', href: '/restaurant/settings/team', permission: Permission.USER_READ },
      { label: 'Roles', href: '/restaurant/settings/roles', permission: Permission.ROLE_READ },
    ],
  },
  {
    label: 'FLOOR SETUP',
    items: [
      {
        label: 'Dining sections',
        href: '/restaurant/settings/dining-sections',
        permission: Permission.SETTINGS_READ,
      },
      {
        label: 'Tables',
        href: '/restaurant/settings/tables',
        permission: Permission.SETTINGS_READ,
      },
      {
        label: 'Table statuses',
        href: '/restaurant/settings/table-statuses',
        permission: Permission.SETTINGS_READ,
      },
    ],
  },
  {
    label: 'MENU',
    items: [
      {
        label: 'Menu categories',
        href: '/restaurant/settings/menu-categories',
        permission: Permission.SETTINGS_READ,
      },
    ],
  },
  {
    label: 'BILLING',
    items: [
      {
        label: 'Tax & discounts',
        href: '/restaurant/settings/tax-discounts',
        permission: Permission.SETTINGS_READ,
      },
      {
        label: 'Cancellation reasons',
        href: '/restaurant/settings/cancellation-reasons',
        permission: Permission.SETTINGS_READ,
      },
    ],
  },
];
