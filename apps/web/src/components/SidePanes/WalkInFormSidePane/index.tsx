'use client';

import type { ReactElement } from 'react';

import GuestIntakeSidePane, { type GuestIntakeSidePaneProps } from '../GuestIntakeSidePane';

export type WalkInFormSidePaneProps = Omit<GuestIntakeSidePaneProps, 'initialMode'>;
export default function WalkInFormSidePane(props: WalkInFormSidePaneProps): ReactElement {
  return <GuestIntakeSidePane {...props} initialMode="WALK_IN" />;
}
