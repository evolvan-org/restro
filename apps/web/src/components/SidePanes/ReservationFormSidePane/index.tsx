'use client';

import type { ReactElement } from 'react';

import GuestIntakeSidePane, { type GuestIntakeSidePaneProps } from '../GuestIntakeSidePane';

export type ReservationFormSidePaneProps = Omit<GuestIntakeSidePaneProps, 'initialMode'>;
export default function ReservationFormSidePane(props: ReservationFormSidePaneProps): ReactElement {
  return <GuestIntakeSidePane {...props} initialMode="RESERVATION" />;
}
