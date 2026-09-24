'use client';

import { Fragment, type ReactNode } from 'react';

import { api } from '@/lib/api';
import useSetupAxios from '@/hooks/api/useSetupAxios';

import ModalDialog from './ModalDialog';
import SidePane from './SidePane';

/**
 * App shell. Renders page content and the two Redux-driven, app-wide UI
 * containers — the modal dialog and the side pane — so any component can open
 * them via `useShowModal` / `useShowSidePane` without mounting them locally.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  useSetupAxios(api);

  return (
    <Fragment>
      {children}
      <SidePane />
      <ModalDialog />
    </Fragment>
  );
}
